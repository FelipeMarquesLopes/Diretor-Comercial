// Tipos do domínio da nuvem. Espelham as tabelas de
// supabase/migrations/0001_init.sql — ao mudar o schema, mude aqui também.

export type MemberRole = "owner" | "admin" | "member";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Membership = {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
};

export type Profile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

export type Invite = {
  id: string;
  org_id: string;
  email: string;
  role: MemberRole;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

/** Vínculo já resolvido com os dados da organização (o que a UI consome). */
export type MembershipWithOrg = Membership & { organization: Organization };

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
};
