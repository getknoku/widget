/**
 * Widget UI strings, organized per-locale.
 *
 * Components read from a single resolved `UIStrings` dictionary so the
 * language table can be extended in one place. `config.language` selects
 * the active locale; unknown values fall back to English.
 */

/** Shape of a single UI string dictionary. Functions return formatted strings. */
export type UIStrings = {
  assistant: string
  askPlaceholder: string
  continuePlaceholder: string
  searching: string
  foundDocs: (n: number) => string
  readSections: (n: number) => string
  generating: string
  thinking: string
  thoughtFor: (seconds: number) => string
  thoughtDone: string
  aiDisclaimer: string
  close: string
  attach: string
  send: string
  regenerate: string
  copy: string
  copied: string
  helpful: string
  notHelpful: string
  imageOnlyPNG: string
  imageTooLarge: string
  connectionError: (message: string) => string
  consentTitle: string
  consentDisclaimer: string
  consentAcceptText: string
  consentRejectText: string
  dismiss: string
}

const en: UIStrings = {
  assistant: 'Assistant',
  askPlaceholder: 'Ask a question...',
  continuePlaceholder: 'Continue conversation...',
  searching: 'Searching documentation...',
  foundDocs: (n) => `Found ${n} relevant document${n > 1 ? 's' : ''}`,
  readSections: (n) => `Read ${n} section${n > 1 ? 's' : ''}`,
  generating: 'Generating answer...',
  thinking: 'Thinking...',
  thoughtFor: (s) => `Thought for ${s}s`,
  thoughtDone: 'Thinking complete',
  aiDisclaimer: 'Responses are generated using AI and may contain mistakes.',
  close: 'Close',
  attach: 'Attach image',
  send: 'Send',
  regenerate: 'Regenerate',
  copy: 'Copy',
  copied: 'Copied',
  helpful: 'Helpful',
  notHelpful: 'Not helpful',
  imageOnlyPNG: 'Only PNG, JPEG, and WebP images are allowed.',
  imageTooLarge: 'Image must be under 5MB.',
  connectionError: (m) => `Connection error: ${m}`,
  consentTitle: 'Hi there, do you want to use the AI chat?',
  consentDisclaimer: 'By clicking accept, you agree that your questions may be processed to generate an answer.',
  consentAcceptText: 'I agree, let’s chat!',
  consentRejectText: 'No, not interested',
  dismiss: 'Dismiss',
}

const tr: UIStrings = {
  assistant: 'Asistan',
  askPlaceholder: 'Soru sor...',
  continuePlaceholder: 'Sohbete devam et...',
  searching: 'Belgelerde arıyor...',
  foundDocs: (n) => `${n} ilgili belge bulundu`,
  readSections: (n) => `${n} bölüm okundu`,
  generating: 'Cevap oluşturuluyor...',
  thinking: 'Düşünüyor...',
  thoughtFor: (s) => `${s} saniye düşündü`,
  thoughtDone: 'Düşünme tamamlandı',
  aiDisclaimer: 'Cevaplar yapay zeka tarafından oluşturulur, hata içerebilir.',
  close: 'Kapat',
  attach: 'Görsel ekle',
  send: 'Gönder',
  regenerate: 'Yeniden üret',
  copy: 'Kopyala',
  copied: 'Kopyalandı',
  helpful: 'Yararlı',
  notHelpful: 'Yararsız',
  imageOnlyPNG: 'Sadece PNG, JPEG ve WebP görseller kabul edilir.',
  imageTooLarge: 'Görsel 5MB altında olmalı.',
  connectionError: (m) => `Bağlantı hatası: ${m}`,
  consentTitle: 'Merhaba, AI sohbeti kullanmak ister misin?',
  consentDisclaimer: 'Kabul ederek sorularının cevap oluşturmak için işlenebileceğini onaylarsın.',
  consentAcceptText: 'Kabul et ve sohbete başla',
  consentRejectText: 'Hayır, istemiyorum',
  dismiss: 'Kapat',
}

const de: UIStrings = {
  ...en,
  assistant: 'Assistent',
  askPlaceholder: 'Stellen Sie eine Frage...',
  continuePlaceholder: 'Unterhaltung fortsetzen...',
  searching: 'Dokumentation wird durchsucht...',
  foundDocs: (n) => `${n} passende Dokumente gefunden`,
  readSections: (n) => `${n} Abschnitt${n > 1 ? 'e' : ''} gelesen`,
  generating: 'Antwort wird erstellt...',
  thinking: 'Denke nach...',
  thoughtFor: (s) => `${s}s nachgedacht`,
  thoughtDone: 'Fertig',
  aiDisclaimer: 'Antworten werden von einer KI generiert und können Fehler enthalten.',
  send: 'Senden',
  copied: 'Kopiert',
}

const es: UIStrings = {
  ...en,
  assistant: 'Asistente',
  askPlaceholder: 'Haz una pregunta...',
  continuePlaceholder: 'Continuar conversación...',
  searching: 'Buscando en la documentación...',
  foundDocs: (n) => `${n} documento${n > 1 ? 's' : ''} relevante${n > 1 ? 's' : ''}`,
  readSections: (n) => `Leída${n > 1 ? 's' : ''} ${n} sección${n > 1 ? 'es' : ''}`,
  generating: 'Generando respuesta...',
  thinking: 'Pensando...',
  thoughtFor: (s) => `Pensó durante ${s}s`,
  thoughtDone: 'Pensamiento completo',
  aiDisclaimer: 'Las respuestas son generadas por IA y pueden contener errores.',
  send: 'Enviar',
  copied: 'Copiado',
}

const fr: UIStrings = {
  ...en,
  assistant: 'Assistant',
  askPlaceholder: 'Posez une question...',
  continuePlaceholder: 'Continuer la conversation...',
  searching: 'Recherche dans la documentation...',
  foundDocs: (n) => `${n} document${n > 1 ? 's' : ''} pertinent${n > 1 ? 's' : ''}`,
  readSections: (n) => `${n} section${n > 1 ? 's' : ''} lue${n > 1 ? 's' : ''}`,
  generating: 'Génération de la réponse...',
  thinking: 'Réflexion...',
  thoughtFor: (s) => `A réfléchi pendant ${s}s`,
  thoughtDone: 'Réflexion terminée',
  aiDisclaimer: 'Les réponses sont générées par IA et peuvent contenir des erreurs.',
  send: 'Envoyer',
  copied: 'Copié',
}

const it: UIStrings = {
  ...en,
  assistant: 'Assistente',
  askPlaceholder: 'Fai una domanda...',
  continuePlaceholder: 'Continua la conversazione...',
  searching: 'Ricerca nella documentazione...',
  foundDocs: (n) => `Trovati ${n} document${n > 1 ? 'i' : 'o'} rilevant${n > 1 ? 'i' : 'e'}`,
  readSections: (n) => `Lett${n > 1 ? 'e' : 'a'} ${n} sezion${n > 1 ? 'i' : 'e'}`,
  generating: 'Generazione della risposta...',
  thinking: 'Sto pensando...',
  thoughtFor: (s) => `Pensato per ${s}s`,
  thoughtDone: 'Pensiero completato',
  aiDisclaimer: 'Le risposte sono generate dall’IA e possono contenere errori.',
  send: 'Invia',
  copied: 'Copiato',
}

const pt: UIStrings = {
  ...en,
  assistant: 'Assistente',
  askPlaceholder: 'Faça uma pergunta...',
  continuePlaceholder: 'Continuar conversa...',
  searching: 'Pesquisando na documentação...',
  foundDocs: (n) => `${n} documento${n > 1 ? 's' : ''} relevante${n > 1 ? 's' : ''}`,
  readSections: (n) => `${n} seç${n > 1 ? 'ões' : 'ão'} lida${n > 1 ? 's' : ''}`,
  generating: 'Gerando resposta...',
  thinking: 'Pensando...',
  thoughtFor: (s) => `Pensou por ${s}s`,
  thoughtDone: 'Pensamento concluído',
  aiDisclaimer: 'As respostas são geradas por IA e podem conter erros.',
  send: 'Enviar',
  copied: 'Copiado',
}

const nl: UIStrings = {
  ...en,
  assistant: 'Assistent',
  askPlaceholder: 'Stel een vraag...',
  continuePlaceholder: 'Gesprek voortzetten...',
  searching: 'Documentatie doorzoeken...',
  foundDocs: (n) => `${n} relevant${n > 1 ? 'e' : ''} document${n > 1 ? 'en' : ''} gevonden`,
  readSections: (n) => `${n} sectie${n > 1 ? 's' : ''} gelezen`,
  generating: 'Antwoord wordt gegenereerd...',
  thinking: 'Denken...',
  thoughtFor: (s) => `${s}s nagedacht`,
  thoughtDone: 'Klaar met denken',
  aiDisclaimer: 'Antwoorden worden gegenereerd door AI en kunnen fouten bevatten.',
  send: 'Verzenden',
  copied: 'Gekopieerd',
}

const ja: UIStrings = {
  ...en,
  assistant: 'アシスタント',
  askPlaceholder: '質問してください...',
  continuePlaceholder: '会話を続ける...',
  searching: 'ドキュメントを検索中...',
  foundDocs: (n) => `${n}件の関連ドキュメントが見つかりました`,
  readSections: (n) => `${n}件のセクションを読み込みました`,
  generating: '回答を生成中...',
  thinking: '考えています...',
  thoughtFor: (s) => `${s}秒考えました`,
  thoughtDone: '思考完了',
  aiDisclaimer: '回答はAIによって生成されており、誤りが含まれる可能性があります。',
  send: '送信',
  copied: 'コピーしました',
}

const ko: UIStrings = {
  ...en,
  assistant: '어시스턴트',
  askPlaceholder: '질문해 주세요...',
  continuePlaceholder: '대화 계속...',
  searching: '문서를 검색 중...',
  foundDocs: (n) => `${n}개의 관련 문서를 찾았습니다`,
  readSections: (n) => `${n}개의 섹션을 읽었습니다`,
  generating: '답변 생성 중...',
  thinking: '생각 중...',
  thoughtFor: (s) => `${s}초 동안 생각했습니다`,
  thoughtDone: '생각 완료',
  aiDisclaimer: '답변은 AI로 생성되며 오류가 있을 수 있습니다.',
  send: '전송',
  copied: '복사됨',
}

const zh: UIStrings = {
  ...en,
  assistant: '助手',
  askPlaceholder: '提问...',
  continuePlaceholder: '继续对话...',
  searching: '正在搜索文档...',
  foundDocs: (n) => `找到 ${n} 篇相关文档`,
  readSections: (n) => `已读 ${n} 个章节`,
  generating: '正在生成回答...',
  thinking: '思考中...',
  thoughtFor: (s) => `思考了 ${s} 秒`,
  thoughtDone: '思考完成',
  aiDisclaimer: '回答由 AI 生成，可能包含错误。',
  send: '发送',
  copied: '已复制',
}

const ru: UIStrings = {
  ...en,
  assistant: 'Ассистент',
  askPlaceholder: 'Задайте вопрос...',
  continuePlaceholder: 'Продолжить разговор...',
  searching: 'Поиск в документации...',
  foundDocs: (n) => `Найдено ${n} подходящих документов`,
  readSections: (n) => `Прочитано ${n} раздел${n > 1 ? 'ов' : ''}`,
  generating: 'Генерация ответа...',
  thinking: 'Обдумываю...',
  thoughtFor: (s) => `Обдумывал ${s} с`,
  thoughtDone: 'Готово',
  aiDisclaimer: 'Ответы генерируются ИИ и могут содержать ошибки.',
  send: 'Отправить',
  copied: 'Скопировано',
}

const cs: UIStrings = {
  ...en,
  assistant: 'Asistent',
  askPlaceholder: 'Zeptejte se...',
  continuePlaceholder: 'Pokračovat v konverzaci...',
  searching: 'Hledám v dokumentaci...',
  foundDocs: (n) => `Nalezeno ${n} relevantních dokumentů`,
  readSections: (n) => `Přečteno ${n} sekcí`,
  generating: 'Generuji odpověď...',
  thinking: 'Přemýšlím...',
  thoughtFor: (s) => `Přemýšlel ${s}s`,
  thoughtDone: 'Hotovo',
  aiDisclaimer: 'Odpovědi jsou generovány AI a mohou obsahovat chyby.',
  send: 'Odeslat',
  copied: 'Zkopírováno',
}

const dictionaries: Record<string, UIStrings> = {
  en, tr, de, es, fr, it, pt, nl, ja, ko, zh, ru, cs,
}

/** Resolve `lang` (e.g. `"en-US"`) to a `UIStrings` dictionary. Falls back to English. */
export function getDictionary(lang: string): UIStrings {
  const normalized = lang.toLowerCase().split('-')[0]
  return dictionaries[normalized] || dictionaries.en
}

/** Whether `lang` (e.g. `"de"`, `"de-AT"`) maps to a built-in dictionary. */
export function isSupportedLanguage(lang: string): boolean {
  const normalized = lang.toLowerCase().split('-')[0]
  return Boolean(dictionaries[normalized])
}

/**
 * Pick the first supported language from `navigator.languages` /
 * `navigator.language`. Returns `null` when no candidate matches a built-in
 * dictionary or when `navigator` is unavailable.
 */
export function detectBrowserLanguage(): string | null {
  if (typeof navigator === 'undefined') return null
  const candidates: string[] = []
  if (navigator.languages?.length) candidates.push(...navigator.languages)
  if (navigator.language) candidates.push(navigator.language)
  for (const c of candidates) {
    const key = c.toLowerCase().split('-')[0]
    if (dictionaries[key]) return key
  }
  return null
}
