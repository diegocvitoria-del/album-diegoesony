# Diego & Sony

O servidor Node.js consulta a Google Drive API e entrega a galeria pela mesma origem. Cada subpasta diretamente dentro de ALBUM aparece na Home na próxima visita. A API do site entrega os nomes e as fotos que os visitantes podem ver e usa identificadores opacos para os arquivos.

## Executar

1. Use Node.js 22 ou superior.
2. Copie `.env.example` para `.env`. Preencha `DRIVE_API_KEY` e `DRIVE_FOLDER_ID`. Se o link da pasta incluir `resourcekey`, preencha `DRIVE_RESOURCE_KEY`.
3. No Google Cloud, habilite a Google Drive API e restrinja a chave a essa API. A listagem com chave usa a pasta compartilhada como “Qualquer pessoa com o link”.
4. Rode `node --env-file=.env server.mjs` e abra `http://127.0.0.1:4173/`.

Para hospedar, use um serviço que execute Node.js, configure as variáveis no painel de segredos e execute `node server.mjs`. Use `HOST=0.0.0.0` se o serviço encaminhar as conexões para o processo. O GitHub Pages serve arquivos estáticos e esta versão precisa de um servidor Node.js.
