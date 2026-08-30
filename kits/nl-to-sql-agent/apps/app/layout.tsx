import { EB_Garamond, Manrope, Fira_Code } from 'next/font/google';
import '../globals.css';

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Queryline',
  description: 'Ask questions about your database in plain English',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('nl-to-sql-theme');
                if (theme === 'dark' || theme === 'light') {
                  document.documentElement.classList.add(theme);
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${ebGaramond.variable} ${manrope.variable} ${firaCode.variable} min-h-screen bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}