export async function recognizeText(image: File | Blob, lang = 'eng+jpn'): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang)
  try {
    const {
      data: { text },
    } = await worker.recognize(image)
    return text.trim()
  } finally {
    await worker.terminate()
  }
}
