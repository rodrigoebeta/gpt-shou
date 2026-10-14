import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"shōu",description:"Biblioteca privada de referências de Reels.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
