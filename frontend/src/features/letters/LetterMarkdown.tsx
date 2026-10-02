import Markdown, { type Components } from 'react-markdown'

/** The only elements a letter may render. Anything else is unwrapped to its text (or dropped when it has none). */
export const LETTER_ELEMENTS = ['p', 'em', 'strong', 'br', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'a']

const HTTPS = /^https:\/\//i

/** Only absolute https URLs survive; everything else (javascript:, data:, relative, mailto:) becomes empty. */
export function httpsOnly(url: string): string {
  return HTTPS.test(url.trim()) ? url.trim() : ''
}

const components: Components = {
  a: ({ href, children }) =>
    href && HTTPS.test(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
}

/** A letter body: RAW markdown from the API, rendered without any HTML passthrough. */
export function LetterMarkdown({ body }: { body: string }) {
  return (
    <Markdown skipHtml allowedElements={LETTER_ELEMENTS} unwrapDisallowed urlTransform={httpsOnly} components={components}>
      {body}
    </Markdown>
  )
}
