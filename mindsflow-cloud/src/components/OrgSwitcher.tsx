"use client";

import type { MembershipWithOrg } from "@/lib/types";

// Seletor de organização. Envia o formulário assim que a escolha muda; sem
// JavaScript, o botão de reserva continua funcionando.

export function OrgSwitcher({
  memberships,
  currentId,
  action,
}: {
  memberships: MembershipWithOrg[];
  currentId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      <select
        name="org_id"
        defaultValue={currentId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="field w-auto py-1.5 text-xs"
        aria-label="Organização ativa"
      >
        {memberships.map((m) => (
          <option key={m.org_id} value={m.org_id}>
            {m.organization?.name ?? m.org_id}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn-ghost py-1.5 text-xs">
          Trocar
        </button>
      </noscript>
    </form>
  );
}
