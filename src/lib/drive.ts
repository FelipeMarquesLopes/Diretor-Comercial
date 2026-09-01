// Acesso de LEITURA ao Google Drive comercial da clínica (via conta de serviço).
//
// A Lara usa isto para, quando um parceiro pedir documentos/informações, achar
// os arquivos certos (CNPJ, contrato social, alvará, apresentações...) e usar o
// conteúdo para montar o rascunho de resposta.
//
// SEGURANÇA: a conta de serviço só enxerga as pastas que foram COMPARTILHADAS
// com o e-mail dela. Nada de dado de paciente entra aqui — é responsabilidade do
// compartilhamento (só pastas comerciais). Escopo: drive.readonly (só leitura).
//
// Autenticação sem dependência extra: assinamos um JWT com a chave privada da
// conta de serviço (crypto nativo) e trocamos por um access_token do Google.

import crypto from "crypto";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function getKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const k = JSON.parse(raw);
    if (k.client_email && k.private_key) return k;
  } catch {
    // valor inválido
  }
  return null;
}

export function driveConfigured(): boolean {
  return !!getKey();
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const key = getKey();
  if (!key) {
    throw new Error(
      "Google Drive não configurado (falta GOOGLE_SERVICE_ACCOUNT_KEY na Vercel).",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(key.private_key.replace(/\\n/g, "\n"))
    .toString("base64url");
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Falha ao autenticar no Google Drive (${res.status}). ${t.slice(0, 120)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google não retornou token de acesso.");
  tokenCache = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return tokenCache.token;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  link: string | null;
  modified: string | null;
}

function escQ(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Busca arquivos por nome/conteúdo nas pastas compartilhadas. termo vazio =
// lista os mais recentes (útil para testar a conexão).
export async function buscarArquivos(termo: string, max = 20): Promise<DriveFile[]> {
  const token = await getAccessToken();
  const t = (termo ?? "").trim();
  const q = t
    ? `(name contains '${escQ(t)}' or fullText contains '${escQ(t)}') and trashed = false`
    : "trashed = false";
  const url =
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q,
      pageSize: String(max),
      fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
      orderBy: "modifiedTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const tx = await res.text().catch(() => "");
    throw new Error(`Erro ao buscar no Drive (${res.status}). ${tx.slice(0, 120)}`);
  }
  const data = (await res.json()) as {
    files?: {
      id: string;
      name: string;
      mimeType: string;
      modifiedTime?: string;
      webViewLink?: string;
    }[];
  };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    link: f.webViewLink ?? null,
    modified: f.modifiedTime ?? null,
  }));
}

// Lê o conteúdo de um arquivo (texto). Google Docs → texto; Sheets → CSV;
// arquivos de texto → conteúdo. PDFs/outros → só metadados + link (para o CEO
// abrir/anexar).
export async function lerArquivo(fileId: string): Promise<{
  name: string;
  mimeType: string;
  link: string | null;
  texto: string;
}> {
  const token = await getAccessToken();
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) },
  );
  if (!metaRes.ok) throw new Error(`Arquivo não encontrado no Drive (${metaRes.status}).`);
  const meta = (await metaRes.json()) as {
    name: string;
    mimeType: string;
    webViewLink?: string;
  };
  const mime = meta.mimeType;

  const auth = { Authorization: `Bearer ${token}` };
  const sig = () => AbortSignal.timeout(15000);
  let texto = "";
  if (mime === "application/vnd.google-apps.document") {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      { headers: auth, signal: sig() },
    );
    texto = r.ok ? await r.text() : "";
  } else if (mime === "application/vnd.google-apps.spreadsheet") {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`,
      { headers: auth, signal: sig() },
    );
    texto = r.ok ? await r.text() : "";
  } else if (mime.startsWith("text/") || mime === "application/json") {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: auth, signal: sig() },
    );
    texto = r.ok ? await r.text() : "";
  } else {
    texto = `(Arquivo do tipo "${mime}" — não dá para extrair o texto aqui. Use o link para abrir ou anexar o arquivo.)`;
  }

  return {
    name: meta.name,
    mimeType: mime,
    link: meta.webViewLink ?? null,
    texto: texto.slice(0, 8000),
  };
}
