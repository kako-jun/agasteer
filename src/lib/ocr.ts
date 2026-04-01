export async function recognizeText(image: File | Blob, lang = 'eng+jpn'): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang)
  const {
    data: { text },
  } = await worker.recognize(image)
  await worker.terminate()
  return text.trim()
}
