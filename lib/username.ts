export function makeUsername(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length < 2) throw new Error("Informe nome e sobrenome para gerar o login.");
  return parts.join(".");
}
export function loginEmail(username: string) {
  return `${username.toLowerCase().trim()}@login.gera.invalid`;
}
