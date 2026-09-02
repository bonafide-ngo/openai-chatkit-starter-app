import type { SupportedLocale } from "@openai/chatkit";

const readEnvString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const configuredApiUrl = readEnvString(import.meta.env.VITE_CHATKIT_API_URL);

const isLoopbackUrl = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

export const CHATKIT_API_URL =
  configuredApiUrl && !isLoopbackUrl(configuredApiUrl)
    ? configuredApiUrl
    : "/chatkit";

export const CHATKIT_TEMPORARY_API_URL = CHATKIT_API_URL.replace(
  /\/chatkit\/?$/,
  "/chatkit/temporary",
);
export const KNOWLEDGE_BASE_URL = `${CHATKIT_API_URL.replace(/\/$/, "")}/knowledge-base`;

export const SUPPORTED_APP_LOCALES: SupportedLocale[] = [
  "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "zh",
];

const supportedLocales = new Set<SupportedLocale>(SUPPORTED_APP_LOCALES);

const readCookie = (name: string): string | undefined =>
  document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const CHATKIT_LOCALE: SupportedLocale = (() => {
  const savedLanguage = readCookie("chatkit-language");
  const language = (savedLanguage || navigator.language.split("-")[0]) as SupportedLocale;
  return supportedLocales.has(language) ? language : "en";
})();

export const setChatkitLocale = (locale: SupportedLocale): void => {
  document.cookie = `chatkit-language=${encodeURIComponent(locale)}; max-age=31536000; path=/; SameSite=Lax`;
};

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "Language", de: "Sprache", es: "Idioma", fr: "Langue", it: "Lingua",
  ja: "言語", ko: "언어", nl: "Taal", pl: "Język", pt: "Idioma", ru: "Язык", zh: "语言",
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", de: "Deutsch", es: "Español", fr: "Français", it: "Italiano",
  ja: "日本語", ko: "한국어", nl: "Nederlands", pl: "Polski", pt: "Português",
  ru: "Русский", zh: "中文",
};

export const FILE_STATUS_LABELS: Record<string, Record<string, string>> = {
  en: { completed: "Completed", in_progress: "Processing", failed: "Failed", cancelled: "Cancelled" },
  de: { completed: "Abgeschlossen", in_progress: "Wird verarbeitet", failed: "Fehlgeschlagen", cancelled: "Abgebrochen" },
  es: { completed: "Completado", in_progress: "Procesando", failed: "Fallido", cancelled: "Cancelado" },
  fr: { completed: "Terminé", in_progress: "Traitement", failed: "Échec", cancelled: "Annulé" },
  it: { completed: "Completato", in_progress: "In elaborazione", failed: "Fallito", cancelled: "Annullato" },
  ja: { completed: "完了", in_progress: "処理中", failed: "失敗", cancelled: "キャンセル済み" },
  ko: { completed: "완료됨", in_progress: "처리 중", failed: "실패", cancelled: "취소됨" },
  nl: { completed: "Voltooid", in_progress: "In behandeling", failed: "Mislukt", cancelled: "Geannuleerd" },
  pl: { completed: "Ukończono", in_progress: "Przetwarzanie", failed: "Niepowodzenie", cancelled: "Anulowano" },
  pt: { completed: "Concluído", in_progress: "Processando", failed: "Falhou", cancelled: "Cancelado" },
  ru: { completed: "Завершено", in_progress: "Обработка", failed: "Ошибка", cancelled: "Отменено" },
  zh: { completed: "已完成", in_progress: "处理中", failed: "失败", cancelled: "已取消" },
};

export const getFileStatusLabel = (status: string): string =>
  FILE_STATUS_LABELS[CHATKIT_LOCALE][status] ?? status;

export const MISSING_THREAD_MESSAGES: Record<string, string> = {
  en: "This chat is no longer available and was removed from history.",
  de: "Dieser Chat ist nicht mehr verfügbar und wurde aus dem Verlauf entfernt.",
  es: "Este chat ya no está disponible y se eliminó del historial.",
  fr: "Cette conversation n'est plus disponible et a été supprimée de l'historique.",
  it: "Questa chat non è più disponibile ed è stata rimossa dalla cronologia.",
  ja: "このチャットは利用できないため、履歴から削除しました。",
  ko: "이 채팅은 더 이상 사용할 수 없어 기록에서 삭제되었습니다.",
  nl: "Dit gesprek is niet meer beschikbaar en is uit de geschiedenis verwijderd.",
  pl: "Ten czat jest już niedostępny i został usunięty z historii.",
  pt: "Esta conversa não está mais disponível e foi removida do histórico.",
  ru: "Этот разговор больше недоступен и был удален из истории.",
  zh: "此聊天已不可用，已从历史记录中删除。",
};

type UiLabels = {
  temporary: string;
  light: string;
  dark: string;
  deleteAll: string;
  switchTo: string;
  files: string;
  knowledgeBase: string;
  knowledgeBaseDescription: string;
  close: string;
  vectorStore: string;
  noConfiguredStores: string;
  chooseFile: string;
  localOrKnowledgeBase: string;
  useLocally: string;
  uploadToKnowledgeBase: string;
  cancel: string;
  indexingFile: string;
  fileReplaced: string;
  fileIndexed: string;
  fileAdded: string;
  indexedFiles: string;
  deleteFile: string;
  deleteFiles: string;
  confirmDeleteFile: string;
  confirmDeleteFiles: string;
  unableToLoadFiles: string;
  unableToLoadStores: string;
  unableToIndexFile: string;
  unableToAddFile: string;
  unableToDeleteFile: string;
  unableToDeleteFiles: string;
  unableToUploadLocalFile: string;
};

export const CURRENT_UI_LABELS: Record<string, UiLabels> = {
  en: { temporary: "Temporary", light: "Light", dark: "Dark", deleteAll: "Delete all", switchTo: "Switch to", files: "Files", knowledgeBase: "Knowledge base", knowledgeBaseDescription: "Upload, replace, or remove indexed files.", close: "Close", vectorStore: "Vector store", noConfiguredStores: "No configured stores", chooseFile: "Choose a file", localOrKnowledgeBase: "Use this file locally for the current conversation, or index it in the selected knowledge base.", useLocally: "Use locally", uploadToKnowledgeBase: "Upload to knowledge base", cancel: "Cancel", indexingFile: "Indexing file...", fileReplaced: "File replaced and reindexed.", fileIndexed: "File indexed.", fileAdded: "File added to the conversation.", indexedFiles: "Indexed files", deleteFile: "Delete", deleteFiles: "Delete all", confirmDeleteFile: "Delete this file from the selected vector store?", confirmDeleteFiles: "Delete every file from the selected vector store?", unableToLoadFiles: "Unable to load knowledge-base files.", unableToLoadStores: "Unable to load vector stores.", unableToIndexFile: "Unable to index file.", unableToAddFile: "Unable to add local file.", unableToDeleteFile: "Unable to delete file.", unableToDeleteFiles: "Unable to delete files.", unableToUploadLocalFile: "Unable to add file to the conversation." },
  de: { temporary: "Temporär", light: "Hell", dark: "Dunkel", deleteAll: "Alle löschen", switchTo: "Wechseln zu", files: "Dateien", knowledgeBase: "Wissensbasis", knowledgeBaseDescription: "Indizierte Dateien hochladen, ersetzen oder entfernen.", close: "Schließen", vectorStore: "Vektorspeicher", noConfiguredStores: "Keine konfigurierten Speicher", chooseFile: "Datei auswählen", localOrKnowledgeBase: "Diese Datei nur für die aktuelle Unterhaltung verwenden oder in der ausgewählten Wissensbasis indizieren.", useLocally: "Lokal verwenden", uploadToKnowledgeBase: "In Wissensbasis hochladen", cancel: "Abbrechen", indexingFile: "Datei wird indiziert...", fileReplaced: "Datei ersetzt und neu indiziert.", fileIndexed: "Datei indiziert.", fileAdded: "Datei zur Unterhaltung hinzugefügt.", indexedFiles: "Indizierte Dateien", deleteFile: "Löschen", deleteFiles: "Alle löschen", confirmDeleteFile: "Diese Datei aus dem ausgewählten Vektorspeicher löschen?", confirmDeleteFiles: "Alle Dateien aus dem ausgewählten Vektorspeicher löschen?", unableToLoadFiles: "Wissensbasis-Dateien konnten nicht geladen werden.", unableToLoadStores: "Vektorspeicher konnten nicht geladen werden.", unableToIndexFile: "Datei konnte nicht indiziert werden.", unableToAddFile: "Datei konnte nicht lokal hinzugefügt werden.", unableToDeleteFile: "Datei konnte nicht gelöscht werden.", unableToDeleteFiles: "Dateien konnten nicht gelöscht werden.", unableToUploadLocalFile: "Datei konnte nicht zur Unterhaltung hinzugefügt werden." },
  es: { temporary: "Temporal", light: "Claro", dark: "Oscuro", deleteAll: "Borrar todo", switchTo: "Cambiar a", files: "Archivos", knowledgeBase: "Base de conocimiento", knowledgeBaseDescription: "Sube, reemplaza o elimina archivos indexados.", close: "Cerrar", vectorStore: "Almacén vectorial", noConfiguredStores: "No hay almacenes configurados", chooseFile: "Elegir un archivo", localOrKnowledgeBase: "Usa este archivo solo en la conversación actual o indízalo en la base de conocimiento seleccionada.", useLocally: "Usar localmente", uploadToKnowledgeBase: "Subir a la base de conocimiento", cancel: "Cancelar", indexingFile: "Indexando archivo...", fileReplaced: "Archivo reemplazado y reindexado.", fileIndexed: "Archivo indexado.", fileAdded: "Archivo añadido a la conversación.", indexedFiles: "Archivos indexados", deleteFile: "Eliminar", deleteFiles: "Eliminar todo", confirmDeleteFile: "¿Eliminar este archivo del almacén vectorial seleccionado?", confirmDeleteFiles: "¿Eliminar todos los archivos del almacén vectorial seleccionado?", unableToLoadFiles: "No se pudieron cargar los archivos de la base de conocimiento.", unableToLoadStores: "No se pudieron cargar los almacenes vectoriales.", unableToIndexFile: "No se pudo indexar el archivo.", unableToAddFile: "No se pudo añadir el archivo local.", unableToDeleteFile: "No se pudo eliminar el archivo.", unableToDeleteFiles: "No se pudieron eliminar los archivos.", unableToUploadLocalFile: "No se pudo añadir el archivo a la conversación." },
  fr: { temporary: "Temporaire", light: "Clair", dark: "Sombre", deleteAll: "Tout supprimer", switchTo: "Passer en", files: "Fichiers", knowledgeBase: "Base de connaissances", knowledgeBaseDescription: "Importez, remplacez ou supprimez les fichiers indexés.", close: "Fermer", vectorStore: "Base vectorielle", noConfiguredStores: "Aucune base configurée", chooseFile: "Choisir un fichier", localOrKnowledgeBase: "Utilisez ce fichier dans la conversation actuelle ou indexez-le dans la base de connaissances sélectionnée.", useLocally: "Utiliser localement", uploadToKnowledgeBase: "Importer dans la base", cancel: "Annuler", indexingFile: "Indexation du fichier...", fileReplaced: "Fichier remplacé et réindexé.", fileIndexed: "Fichier indexé.", fileAdded: "Fichier ajouté à la conversation.", indexedFiles: "Fichiers indexés", deleteFile: "Supprimer", deleteFiles: "Tout supprimer", confirmDeleteFile: "Supprimer ce fichier de la base vectorielle sélectionnée ?", confirmDeleteFiles: "Supprimer tous les fichiers de la base vectorielle sélectionnée ?", unableToLoadFiles: "Impossible de charger les fichiers de la base.", unableToLoadStores: "Impossible de charger les bases vectorielles.", unableToIndexFile: "Impossible d'indexer le fichier.", unableToAddFile: "Impossible d'ajouter le fichier local.", unableToDeleteFile: "Impossible de supprimer le fichier.", unableToDeleteFiles: "Impossible de supprimer les fichiers.", unableToUploadLocalFile: "Impossible d'ajouter le fichier à la conversation." },
  it: { temporary: "Temporanea", light: "Chiaro", dark: "Scuro", deleteAll: "Elimina tutto", switchTo: "Passa a", files: "File", knowledgeBase: "Base di conoscenza", knowledgeBaseDescription: "Carica, sostituisci o rimuovi i file indicizzati.", close: "Chiudi", vectorStore: "Archivio vettoriale", noConfiguredStores: "Nessun archivio configurato", chooseFile: "Scegli un file", localOrKnowledgeBase: "Usa questo file nella conversazione corrente oppure indicizzalo nella base selezionata.", useLocally: "Usa localmente", uploadToKnowledgeBase: "Carica nella base di conoscenza", cancel: "Annulla", indexingFile: "Indicizzazione del file...", fileReplaced: "File sostituito e reindicizzato.", fileIndexed: "File indicizzato.", fileAdded: "File aggiunto alla conversazione.", indexedFiles: "File indicizzati", deleteFile: "Elimina", deleteFiles: "Elimina tutto", confirmDeleteFile: "Eliminare questo file dall'archivio vettoriale selezionato?", confirmDeleteFiles: "Eliminare tutti i file dall'archivio vettoriale selezionato?", unableToLoadFiles: "Impossibile caricare i file della base.", unableToLoadStores: "Impossibile caricare gli archivi vettoriali.", unableToIndexFile: "Impossibile indicizzare il file.", unableToAddFile: "Impossibile aggiungere il file locale.", unableToDeleteFile: "Impossibile eliminare il file.", unableToDeleteFiles: "Impossibile eliminare i file.", unableToUploadLocalFile: "Impossibile aggiungere il file alla conversazione." },
  ja: { temporary: "一時的", light: "ライト", dark: "ダーク", deleteAll: "すべて削除", switchTo: "切り替え", files: "ファイル", knowledgeBase: "ナレッジベース", knowledgeBaseDescription: "インデックス済みファイルをアップロード、置換、削除します。", close: "閉じる", vectorStore: "ベクトルストア", noConfiguredStores: "設定されたストアはありません", chooseFile: "ファイルを選択", localOrKnowledgeBase: "このファイルを現在の会話だけで使用するか、選択したナレッジベースに登録します。", useLocally: "ローカルで使用", uploadToKnowledgeBase: "ナレッジベースに登録", cancel: "キャンセル", indexingFile: "ファイルをインデックス中...", fileReplaced: "ファイルを置換して再インデックスしました。", fileIndexed: "ファイルをインデックスしました。", fileAdded: "ファイルを会話に追加しました。", indexedFiles: "インデックス済みファイル", deleteFile: "削除", deleteFiles: "すべて削除", confirmDeleteFile: "選択したベクトルストアからこのファイルを削除しますか？", confirmDeleteFiles: "選択したベクトルストアからすべてのファイルを削除しますか？", unableToLoadFiles: "ナレッジベースのファイルを読み込めません。", unableToLoadStores: "ベクトルストアを読み込めません。", unableToIndexFile: "ファイルをインデックスできません。", unableToAddFile: "ローカルファイルを追加できません。", unableToDeleteFile: "ファイルを削除できません。", unableToDeleteFiles: "ファイルを削除できません。", unableToUploadLocalFile: "ファイルを会話に追加できません。" },
  ko: { temporary: "임시", light: "라이트", dark: "다크", deleteAll: "모두 삭제", switchTo: "전환", files: "파일", knowledgeBase: "지식 베이스", knowledgeBaseDescription: "색인된 파일을 업로드, 교체 또는 삭제합니다.", close: "닫기", vectorStore: "벡터 저장소", noConfiguredStores: "구성된 저장소가 없습니다", chooseFile: "파일 선택", localOrKnowledgeBase: "이 파일을 현재 대화에서만 사용하거나 선택한 지식 베이스에 색인합니다.", useLocally: "로컬에서 사용", uploadToKnowledgeBase: "지식 베이스에 업로드", cancel: "취소", indexingFile: "파일 색인 중...", fileReplaced: "파일을 교체하고 다시 색인했습니다.", fileIndexed: "파일을 색인했습니다.", fileAdded: "파일을 대화에 추가했습니다.", indexedFiles: "색인된 파일", deleteFile: "삭제", deleteFiles: "모두 삭제", confirmDeleteFile: "선택한 벡터 저장소에서 이 파일을 삭제할까요?", confirmDeleteFiles: "선택한 벡터 저장소에서 모든 파일을 삭제할까요?", unableToLoadFiles: "지식 베이스 파일을 불러올 수 없습니다.", unableToLoadStores: "벡터 저장소를 불러올 수 없습니다.", unableToIndexFile: "파일을 색인할 수 없습니다.", unableToAddFile: "로컬 파일을 추가할 수 없습니다.", unableToDeleteFile: "파일을 삭제할 수 없습니다.", unableToDeleteFiles: "파일을 삭제할 수 없습니다.", unableToUploadLocalFile: "파일을 대화에 추가할 수 없습니다." },
  nl: { temporary: "Tijdelijk", light: "Licht", dark: "Donker", deleteAll: "Alles verwijderen", switchTo: "Schakel naar", files: "Bestanden", knowledgeBase: "Kennisbank", knowledgeBaseDescription: "Geïndexeerde bestanden uploaden, vervangen of verwijderen.", close: "Sluiten", vectorStore: "Vectoropslag", noConfiguredStores: "Geen opslag geconfigureerd", chooseFile: "Kies een bestand", localOrKnowledgeBase: "Gebruik dit bestand alleen in het huidige gesprek of indexeer het in de geselecteerde kennisbank.", useLocally: "Lokaal gebruiken", uploadToKnowledgeBase: "Uploaden naar kennisbank", cancel: "Annuleren", indexingFile: "Bestand indexeren...", fileReplaced: "Bestand vervangen en opnieuw geïndexeerd.", fileIndexed: "Bestand geïndexeerd.", fileAdded: "Bestand aan het gesprek toegevoegd.", indexedFiles: "Geïndexeerde bestanden", deleteFile: "Verwijderen", deleteFiles: "Alles verwijderen", confirmDeleteFile: "Dit bestand uit de geselecteerde vectoropslag verwijderen?", confirmDeleteFiles: "Alle bestanden uit de geselecteerde vectoropslag verwijderen?", unableToLoadFiles: "Kan kennisbankbestanden niet laden.", unableToLoadStores: "Kan vectoropslag niet laden.", unableToIndexFile: "Kan bestand niet indexeren.", unableToAddFile: "Kan lokaal bestand niet toevoegen.", unableToDeleteFile: "Kan bestand niet verwijderen.", unableToDeleteFiles: "Kan bestanden niet verwijderen.", unableToUploadLocalFile: "Kan bestand niet aan het gesprek toevoegen." },
  pl: { temporary: "Tymczasowy", light: "Jasny", dark: "Ciemny", deleteAll: "Usuń wszystko", switchTo: "Przełącz na", files: "Pliki", knowledgeBase: "Baza wiedzy", knowledgeBaseDescription: "Przesyłaj, zastępuj lub usuwaj zindeksowane pliki.", close: "Zamknij", vectorStore: "Magazyn wektorowy", noConfiguredStores: "Brak skonfigurowanych magazynów", chooseFile: "Wybierz plik", localOrKnowledgeBase: "Użyj tego pliku tylko w bieżącej rozmowie albo zindeksuj go w wybranej bazie wiedzy.", useLocally: "Użyj lokalnie", uploadToKnowledgeBase: "Prześlij do bazy wiedzy", cancel: "Anuluj", indexingFile: "Indeksowanie pliku...", fileReplaced: "Plik zastąpiono i ponownie zindeksowano.", fileIndexed: "Plik zindeksowano.", fileAdded: "Plik dodano do rozmowy.", indexedFiles: "Zindeksowane pliki", deleteFile: "Usuń", deleteFiles: "Usuń wszystko", confirmDeleteFile: "Usunąć ten plik z wybranego magazynu wektorowego?", confirmDeleteFiles: "Usunąć wszystkie pliki z wybranego magazynu wektorowego?", unableToLoadFiles: "Nie można wczytać plików bazy wiedzy.", unableToLoadStores: "Nie można wczytać magazynów wektorowych.", unableToIndexFile: "Nie można zindeksować pliku.", unableToAddFile: "Nie można dodać pliku lokalnego.", unableToDeleteFile: "Nie można usunąć pliku.", unableToDeleteFiles: "Nie można usunąć plików.", unableToUploadLocalFile: "Nie można dodać pliku do rozmowy." },
  pt: { temporary: "Temporário", light: "Claro", dark: "Escuro", deleteAll: "Excluir tudo", switchTo: "Mudar para", files: "Arquivos", knowledgeBase: "Base de conhecimento", knowledgeBaseDescription: "Envie, substitua ou remova arquivos indexados.", close: "Fechar", vectorStore: "Armazenamento vetorial", noConfiguredStores: "Nenhum armazenamento configurado", chooseFile: "Escolher um arquivo", localOrKnowledgeBase: "Use este arquivo apenas na conversa atual ou indexe-o na base de conhecimento selecionada.", useLocally: "Usar localmente", uploadToKnowledgeBase: "Enviar para a base de conhecimento", cancel: "Cancelar", indexingFile: "Indexando arquivo...", fileReplaced: "Arquivo substituído e reindexado.", fileIndexed: "Arquivo indexado.", fileAdded: "Arquivo adicionado à conversa.", indexedFiles: "Arquivos indexados", deleteFile: "Excluir", deleteFiles: "Excluir tudo", confirmDeleteFile: "Excluir este arquivo do armazenamento vetorial selecionado?", confirmDeleteFiles: "Excluir todos os arquivos do armazenamento vetorial selecionado?", unableToLoadFiles: "Não foi possível carregar os arquivos da base.", unableToLoadStores: "Não foi possível carregar os armazenamentos vetoriais.", unableToIndexFile: "Não foi possível indexar o arquivo.", unableToAddFile: "Não foi possível adicionar o arquivo local.", unableToDeleteFile: "Não foi possível excluir o arquivo.", unableToDeleteFiles: "Não foi possível excluir os arquivos.", unableToUploadLocalFile: "Não foi possível adicionar o arquivo à conversa." },
  ru: { temporary: "Временный", light: "Светлая", dark: "Темная", deleteAll: "Удалить все", switchTo: "Переключить на", files: "Файлы", knowledgeBase: "База знаний", knowledgeBaseDescription: "Загружайте, заменяйте или удаляйте индексированные файлы.", close: "Закрыть", vectorStore: "Векторное хранилище", noConfiguredStores: "Нет настроенных хранилищ", chooseFile: "Выбрать файл", localOrKnowledgeBase: "Используйте файл только в текущем разговоре или добавьте его в выбранную базу знаний.", useLocally: "Использовать локально", uploadToKnowledgeBase: "Загрузить в базу знаний", cancel: "Отмена", indexingFile: "Индексация файла...", fileReplaced: "Файл заменен и проиндексирован заново.", fileIndexed: "Файл проиндексирован.", fileAdded: "Файл добавлен в разговор.", indexedFiles: "Индексированные файлы", deleteFile: "Удалить", deleteFiles: "Удалить все", confirmDeleteFile: "Удалить этот файл из выбранного векторного хранилища?", confirmDeleteFiles: "Удалить все файлы из выбранного векторного хранилища?", unableToLoadFiles: "Не удалось загрузить файлы базы знаний.", unableToLoadStores: "Не удалось загрузить векторные хранилища.", unableToIndexFile: "Не удалось проиндексировать файл.", unableToAddFile: "Не удалось добавить локальный файл.", unableToDeleteFile: "Не удалось удалить файл.", unableToDeleteFiles: "Не удалось удалить файлы.", unableToUploadLocalFile: "Не удалось добавить файл в разговор." },
  zh: { temporary: "临时", light: "浅色", dark: "深色", deleteAll: "全部删除", switchTo: "切换到", files: "文件", knowledgeBase: "知识库", knowledgeBaseDescription: "上传、替换或删除已索引的文件。", close: "关闭", vectorStore: "向量存储", noConfiguredStores: "没有配置的存储", chooseFile: "选择文件", localOrKnowledgeBase: "仅在当前对话中使用此文件，或将其索引到所选知识库。", useLocally: "本地使用", uploadToKnowledgeBase: "上传到知识库", cancel: "取消", indexingFile: "正在索引文件...", fileReplaced: "文件已替换并重新索引。", fileIndexed: "文件已索引。", fileAdded: "文件已添加到对话。", indexedFiles: "已索引文件", deleteFile: "删除", deleteFiles: "全部删除", confirmDeleteFile: "要从选定的向量存储中删除此文件吗？", confirmDeleteFiles: "要从选定的向量存储中删除所有文件吗？", unableToLoadFiles: "无法加载知识库文件。", unableToLoadStores: "无法加载向量存储。", unableToIndexFile: "无法索引文件。", unableToAddFile: "无法添加本地文件。", unableToDeleteFile: "无法删除文件。", unableToDeleteFiles: "无法删除文件。", unableToUploadLocalFile: "无法将文件添加到对话。" },
};

export const UI_LABELS = CURRENT_UI_LABELS[CHATKIT_LOCALE] ?? CURRENT_UI_LABELS.en;

export const SIGN_OUT_LABELS: Record<string, string> = {
  en: "Sign out",
  de: "Abmelden",
  es: "Cerrar sesión",
  fr: "Se déconnecter",
  it: "Disconnetti",
  ja: "サインアウト",
  ko: "로그아웃",
  nl: "Uitloggen",
  pl: "Wyloguj się",
  pt: "Sair",
  ru: "Выйти",
  zh: "退出登录",
};

export const AUTH_GATE_LABELS: Record<string, { loading: string; description: string; signIn: string }> = {
  en: { loading: "Loading...", description: "Sign in with an authorised account to continue.", signIn: "Sign in" },
  de: { loading: "Wird geladen...", description: "Melden Sie sich mit einem autorisierten Konto an, um fortzufahren.", signIn: "Anmelden" },
  es: { loading: "Cargando...", description: "Inicia sesión con una cuenta autorizada para continuar.", signIn: "Iniciar sesión" },
  fr: { loading: "Chargement...", description: "Connectez-vous avec un compte autorisé pour continuer.", signIn: "Se connecter" },
  it: { loading: "Caricamento...", description: "Accedi con un account autorizzato per continuare.", signIn: "Accedi" },
  ja: { loading: "読み込み中...", description: "続行するには承認済みのアカウントでサインインしてください。", signIn: "サインイン" },
  ko: { loading: "로드 중...", description: "계속하려면 승인된 계정으로 로그인하세요.", signIn: "로그인" },
  nl: { loading: "Laden...", description: "Log in met een geautoriseerd account om door te gaan.", signIn: "Inloggen" },
  pl: { loading: "Ładowanie...", description: "Zaloguj się za pomocą autoryzowanego konta, aby kontynuować.", signIn: "Zaloguj się" },
  pt: { loading: "Carregando...", description: "Entre com uma conta autorizada para continuar.", signIn: "Entrar" },
  ru: { loading: "Загрузка...", description: "Войдите с помощью авторизованной учетной записи, чтобы продолжить.", signIn: "Войти" },
  zh: { loading: "正在加载...", description: "请使用已授权的帐户登录以继续。", signIn: "登录" },
};

export const EXPORT_LABELS: Record<string, {
  exportChat: string;
  exportPdf: string;
  exportDocx: string;
  exportFailed: string;
}> = {
  en: { exportChat: "Export", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Unable to export chat." },
  de: { exportChat: "Exportieren", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Chat konnte nicht exportiert werden." },
  es: { exportChat: "Exportar", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "No se pudo exportar el chat." },
  fr: { exportChat: "Exporter", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Impossible d'exporter la conversation." },
  it: { exportChat: "Esporta", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Impossibile esportare la conversazione." },
  ja: { exportChat: "エクスポート", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "会話をエクスポートできません。" },
  ko: { exportChat: "내보내기", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "대화를 내보낼 수 없습니다." },
  nl: { exportChat: "Exporteren", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Kan gesprek niet exporteren." },
  pl: { exportChat: "Eksportuj", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Nie można wyeksportować rozmowy." },
  pt: { exportChat: "Exportar", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Não foi possível exportar a conversa." },
  ru: { exportChat: "Экспорт", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "Не удалось экспортировать разговор." },
  zh: { exportChat: "导出", exportPdf: "PDF", exportDocx: "DOCX", exportFailed: "无法导出对话。" },
};

export const EXPORT_UI_LABELS = EXPORT_LABELS[CHATKIT_LOCALE] ?? EXPORT_LABELS.en;

export const CHATKIT_DELETE_ALL_URL = `${CHATKIT_API_URL.replace(/\/$/, "")}/threads`;

/**
 * ChatKit requires a domain key at runtime. Use the local fallback while
 * developing, and register a production domain key for deployment:
 * https://platform.openai.com/settings/organization/security/domain-allowlist
 */
export const CHATKIT_API_DOMAIN_KEY =
  readEnvString(import.meta.env.VITE_CHATKIT_API_DOMAIN_KEY) ??
  "domain_pk_localhost_dev";
