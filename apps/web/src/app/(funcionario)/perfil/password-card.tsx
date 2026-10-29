"use client";

import { Info, KeyRound, RotateCcw } from "lucide-react";
import { useState } from "react";

// A senha é a da rede Nexo, gerenciada fora deste app. O botão orienta para o autoatendimento
// (mesmo caminho do artigo KB-003) em vez de simular um envio de e-mail.

export function PasswordCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="flex size-9 items-center justify-center rounded-full bg-canvas text-ink-soft">
          <KeyRound className="size-4" />
        </span>
        <div className="flex-1">
          <p className="text-[13px] font-semibold">Senha</p>
          <p className="text-[12px] text-muted">A mesma da rede Nexo</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-canvas"
        >
          <RotateCcw className="size-3.5" /> Redefinir senha
        </button>
      </div>
      {open && (
        <p className="flex items-center gap-2 border-t border-line bg-canvas px-4 py-2.5 text-[12px] text-muted">
          <Info className="size-3.5 shrink-0" />
          Use o Portal de Autoatendimento, opção “Senha da rede”, e confirme com o MFA do celular.
        </p>
      )}
    </div>
  );
}
