/** Nom de fichier sûr : minuscules ASCII, séparateurs « - ». */
export function fileBaseName(text: string): string {
  const slug = text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'porte-cles';
}
