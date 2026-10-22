# Gera — Ordens do Dia

Aplicação de gestão de ordens e atividades com Next.js, Neon Auth e Neon PostgreSQL.

## Arquitetura

- **Next.js na Vercel** para interface e endpoints server-side.
- **Neon Auth (Managed Better Auth)** para identidade e sessões.
- **Neon PostgreSQL** para perfis, ordens, importações, ocorrências e auditoria.
- A autorização é validada no servidor; esconder controles na interface não é uma barreira de segurança.

## Configuração

1. Use Node.js 20.9+.
2. Configure as variáveis de `.env.example` na Vercel e localmente.
3. `DATABASE_URL`: connection string pooled do banco `gera`.
4. `NEON_AUTH_BASE_URL`: URL de autenticação Neon da branch correta.
5. `NEON_AUTH_COOKIE_SECRET`: segredo aleatório de 32 bytes ou mais.
6. `GERA_BOOTSTRAP_SECRET`: segredo aleatório com pelo menos 20 caracteres para o primeiro cadastro. Remova-o da Vercel após criar o administrador principal.
7. Execute `npm install`, `npm run dev`, `npm run typecheck` e `npm run build`.

Nunca coloque credenciais reais em arquivos versionados. Não reutilize o banco de outro produto.

## Inicialização do primeiro administrador

Enquanto não existir um perfil `super_admin`, a tela de login oferece a configuração inicial. O primeiro administrador escolhe seu nome e senha e informa o segredo temporário de bootstrap. O sistema gera um login como `marcus.valerio`. O endpoint só permite uma inicialização e bloqueia novos cadastros quando o perfil principal já existe. Desative/remova `GERA_BOOTSTRAP_SECRET` depois do uso.

## Perfis

- `super_admin`: controle total, inclusive cadastro de administradores.
- `admin`: cadastro de técnicos e importação de Excel.
- `technician`: visualiza ordens atribuídas, atualiza o status e registra ocorrências.

## Cadastro de usuários

O administrador cria um perfil a partir do nome completo. O login é gerado automaticamente. A senha provisória é aleatória, exibida uma única vez e a troca é exigida no primeiro acesso. O cadastro é fechado: não há inscrição pública depois da inicialização.

Para usuários internos, o login de autenticação usa um endereço sintético no domínio reservado `.invalid`; não é usado para comunicação por e-mail. Senhas esquecidas precisam ser redefinidas por fluxo administrativo futuro.

## Importação

O endpoint aceita `.xlsx`, `.xls` e `.csv` de até 10 MB. Primeiro analisa a primeira aba e exibe uma prévia; só aplica após confirmação. Campos reconhecidos incluem número/OS, atividade, descrição, equipamento, local, técnico, prioridade e data. Um número de OS estável é a melhor chave para detectar alterações. Sem número, o sistema calcula uma chave a partir do título/equipamento/local.

A importação é transacional e registra eventos e auditoria. Reimportações atualizam dados da planilha sem reabrir ordens concluídas nem apagar sua data de conclusão.

## Banco de dados

O schema inicial foi provisionado no projeto Neon `gera` (região `aws-sa-east-1`) e está documentado em `migrations/0001_initial_schema.sql`. A aplicação precisa receber `DATABASE_URL` e `NEON_AUTH_BASE_URL` do projeto/branch correto antes de ser implantada.

