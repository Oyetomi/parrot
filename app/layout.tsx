import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parrot — hear yourself speak',
  description:
    'Upload a recording in any language. Get a word-synced transcript, your speaking pace, every pause, and every mistake explained.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦜</text></svg>",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Spectral:ital,wght@0,400;0,500;1,400&display=swap"
        />
      </head>
      <body>
        {children}
        <footer>
          <div className="wrap">
            <p>
              Transcription by <b>Whisper large-v3-turbo</b> on Groq. Analysis by an LLM you pick.
              <br />
              Pace, pauses and stalls are computed locally from word timings.
            </p>
            <p>
              Caveat, and it matters: Whisper normalises pronunciation toward the standard
              <br />
              form of a language, so <b>accent and phoneme errors are under-reported</b>.
              <br />
              Parrot judges grammar and word choice. Your ears judge the rest.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
