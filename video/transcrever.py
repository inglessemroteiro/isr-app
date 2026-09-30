#!/usr/bin/env python3
"""Transcreve o áudio de um vídeo, com o tempo de cada palavra.

É o primeiro passo da edição: o editor lê a transcrição para decidir o que
cortar e escreve as legendas a partir dela. Também mede os silêncios e já
sugere uma lista de cortes (tudo que não é silêncio), que o editor ajusta.

Uso:
    python3 video/transcrever.py video/entrada/meu-video.mp4
    python3 video/transcrever.py video/entrada/meu-video.mp4 --modelo medium --idioma pt

Saída (em video/trabalho/<nome>/):
    transcricao.json   frases, palavras com tempo, silêncios, sugestão de cortes
    transcricao.txt    a mesma coisa, legível, para ler antes de planejar
    audio.wav          o áudio extraído (16 kHz, mono)

Modelos: tiny, base, small (padrão), medium, large-v3. O small acerta bem o
português e roda em uns 20% do tempo do vídeo num laptop. O medium é mais
preciso com palavras em inglês no meio da fala, mas leva 3 a 4 vezes mais.
Na primeira vez o modelo é baixado de huggingface.co (uns 500 MB no small).
"""
import argparse
import json
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))


def falhar(msg):
    sys.stderr.write("\n✗ " + msg + "\n\n")
    sys.exit(1)


def rodar(args):
    r = subprocess.run(args, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def sondar(arquivo):
    codigo, out, err = rodar(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", arquivo])
    if codigo != 0:
        falhar("não consegui ler " + arquivo + "\n" + err)
    j = json.loads(out)
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in j.get("streams", []) if s.get("codec_type") == "audio"), None)
    return {
        "duracao": float(j.get("format", {}).get("duration") or 0),
        "largura": v.get("width") if v else None,
        "altura": v.get("height") if v else None,
        "tem_audio": a is not None,
    }


def extrair_audio(entrada, wav):
    codigo, _, err = rodar(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", entrada, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav])
    if codigo != 0:
        falhar("não consegui extrair o áudio\n" + err)


def medir_silencios(wav, limiar_db, minimo):
    _, _, err = rodar(["ffmpeg", "-hide_banner", "-i", wav, "-af", "silencedetect=n=%ddB:d=%s" % (limiar_db, minimo), "-f", "null", "-"])
    silencios = []
    inicio = None
    for linha in err.splitlines():
        m = re.search(r"silence_start: ([\d.]+)", linha)
        if m:
            inicio = float(m.group(1))
        m = re.search(r"silence_end: ([\d.]+)", linha)
        if m and inicio is not None:
            fim = float(m.group(1))
            silencios.append({"ini": round(inicio, 2), "fim": round(fim, 2), "dur": round(fim - inicio, 2)})
            inicio = None
    return silencios


def sugerir_cortes(duracao, silencios, folga):
    """Mantém tudo que não é silêncio, com uma folga de cada lado."""
    trechos = []
    cursor = 0.0
    for s in silencios:
        fim_trecho = s["ini"] + folga
        if fim_trecho - cursor > 0.3:
            trechos.append({"ini": round(max(0.0, cursor), 2), "fim": round(min(duracao, fim_trecho), 2)})
        cursor = s["fim"] - folga
    if duracao - cursor > 0.3:
        trechos.append({"ini": round(max(0.0, cursor), 2), "fim": round(duracao, 2)})
    return trechos


def transcrever(wav, modelo, idioma, contexto):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        falhar("faster-whisper não está instalado. Rode: bash video/preparar.sh")
    try:
        m = WhisperModel(modelo, device="cpu", compute_type="int8")
    except Exception as e:  # noqa: BLE001
        falhar("não consegui carregar o modelo '%s'. Na primeira vez ele é baixado de huggingface.co; "
               "se a rede bloqueia esse endereço, libere-o ou rode a transcrição no seu computador.\n%s" % (modelo, e))
    segs, info = m.transcribe(wav, language=idioma, word_timestamps=True, vad_filter=True, beam_size=5, initial_prompt=contexto or None)
    frases = []
    for s in segs:
        palavras = []
        for w in (s.words or []):
            palavras.append({"w": w.word.strip(), "ini": round(w.start, 2), "fim": round(w.end, 2), "prob": round(w.probability, 2)})
        frases.append({"ini": round(s.start, 2), "fim": round(s.end, 2), "texto": s.text.strip(), "palavras": palavras})
    return frases, info.language


def hms(t):
    m = int(t // 60)
    return "%02d:%05.2f" % (m, t - m * 60)


def main():
    ap = argparse.ArgumentParser(description="Transcreve um vídeo com tempo por palavra.")
    ap.add_argument("entrada")
    ap.add_argument("--saida", help="pasta de trabalho (padrão: video/trabalho/<nome do vídeo>)")
    ap.add_argument("--modelo", default="small")
    ap.add_argument("--idioma", default=None, help="pt, en… (padrão: detecta)")
    ap.add_argument("--contexto", default="Inglês sem Roteiro. Gabi, professora de inglês, fala com brasileiras que moram na Holanda. Mistura português com palavras em inglês.")
    ap.add_argument("--silencio", type=float, default=0.6, help="silêncio mínimo, em segundos, para entrar na lista (padrão 0.6)")
    ap.add_argument("--limiar", type=int, default=-35, help="abaixo de quantos dB é silêncio (padrão -35)")
    ap.add_argument("--folga", type=float, default=0.12, help="quanto sobra de silêncio em cada corte sugerido (padrão 0.12 s)")
    ap.add_argument("--so-silencios", action="store_true", help="não transcreve; só mede silêncios e sugere cortes")
    a = ap.parse_args()

    entrada = os.path.abspath(a.entrada)
    if not os.path.exists(entrada):
        falhar("vídeo não encontrado: " + entrada)
    nome = re.sub(r"\.[^.]+$", "", os.path.basename(entrada))
    pasta = os.path.abspath(a.saida) if a.saida else os.path.join(AQUI, "trabalho", nome)
    os.makedirs(pasta, exist_ok=True)

    info = sondar(entrada)
    if not info["tem_audio"]:
        falhar("o vídeo não tem áudio; não há o que transcrever")
    print("Vídeo: %s · %sx%s · %.2fs" % (os.path.basename(entrada), info["largura"], info["altura"], info["duracao"]))

    wav = os.path.join(pasta, "audio.wav")
    extrair_audio(entrada, wav)
    silencios = medir_silencios(wav, a.limiar, a.silencio)
    cortes = sugerir_cortes(info["duracao"], silencios, a.folga)
    print("Silêncios de %.1fs ou mais: %d · sugestão de cortes: %d trecho(s), %.2fs no total" % (
        a.silencio, len(silencios), len(cortes), sum(c["fim"] - c["ini"] for c in cortes)))

    frases, idioma = ([], None)
    if not a.so_silencios:
        print("Transcrevendo com o modelo %s…" % a.modelo)
        frases, idioma = transcrever(wav, a.modelo, a.idioma, a.contexto)
        print("Idioma: %s · %d frase(s), %d palavra(s)" % (idioma, len(frases), sum(len(f["palavras"]) for f in frases)))

    resultado = {
        "arquivo": entrada, "duracao": round(info["duracao"], 2), "largura": info["largura"], "altura": info["altura"],
        "idioma": idioma, "modelo": None if a.so_silencios else a.modelo,
        "texto": " ".join(f["texto"] for f in frases),
        "frases": frases, "silencios": silencios, "sugestao_cortes": cortes,
    }
    with open(os.path.join(pasta, "transcricao.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=1)

    linhas = ["# %s · %.2fs · idioma %s" % (os.path.basename(entrada), info["duracao"], idioma or "?"), ""]
    if frases:
        linhas.append("## Fala (início → fim) — palavras com ? têm confiança baixa")
        for fr in frases:
            txt = " ".join((w["w"] + ("?" if w["prob"] < 0.5 else "")) for w in fr["palavras"]) or fr["texto"]
            linhas.append("[%s → %s] %s" % (hms(fr["ini"]), hms(fr["fim"]), txt))
        linhas.append("")
    linhas.append("## Silêncios de %.1fs ou mais" % a.silencio)
    for s in silencios:
        linhas.append("[%s → %s] %.2fs" % (hms(s["ini"]), hms(s["fim"]), s["dur"]))
    linhas.append("")
    linhas.append("## Sugestão de cortes (o que fica, tirando os silêncios)")
    for c in cortes:
        linhas.append("%.2f → %.2f" % (c["ini"], c["fim"]))
    with open(os.path.join(pasta, "transcricao.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    print("Pronto: %s" % os.path.join(pasta, "transcricao.txt"))


if __name__ == "__main__":
    main()
