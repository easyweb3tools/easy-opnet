import localFont from "next/font/local";

export const inter = localFont({
  src: [
    {
      path: "../assets/fonts/Inter-latin.woff2",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const jetbrainsMono = localFont({
  src: [
    {
      path: "../assets/fonts/JetBrainsMono-latin.woff2",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
