import { Loader2 } from 'lucide-react'

/**
 * Estado de carregamento explícito para qualquer trecho do boot que dependa
 * de uma leitura assíncrona (localStorage, SQLite/Tauri) ainda não resolvida
 * — ver App.jsx (`isCashLoaded`). Existe pra nunca precisar de um
 * `return null` nesse meio-tempo: `null` colapsa a árvore renderizada pra
 * nada, e como `body` não tem uma cor de fundo própria (ver src/index.css),
 * o que aparece por trás é a tela preta que este componente evita.
 */
export default function LoadingScreen({ label = 'Carregando...' }) {
  return (
    <div className="flex h-svh items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  )
}
