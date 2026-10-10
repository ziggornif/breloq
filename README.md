# Générateur de porte-clés

Générateur paramétrique de porte-clés à partir d'un texte, pour la **découpe laser** et l'**impression 3D**. Tout tourne dans le navigateur : aucun serveur, aucun compte.

**Démo :** https://<user>.github.io/<repo>/

> Inspiré du générateur paramétrique de porte-clés d'[Atomm](https://www.atomm.com/). Projet personnel, non affilié à Atomm ni à xTool.

## Fonctionnalités

- **Texte** : 14 polices embarquées (scripts attachés et grasses) ou import d'une police TTF/OTF/WOFF ; taille, espacement, épaisseur du texte, épaisseur du contour.
- **Icône** : recherche parmi des milliers d'icônes pleines (Material Design, Font Awesome, Game Icons, Remix…) via l'API Iconify, fusionnée au contour.
- **Trou d'attache** : à gauche, à droite ou en haut, diamètre, marge et décalage réglables.
- **Aperçu 2D** (cotes en mm) et **aperçu 3D** (contreplaqué en mode laser, couleurs choisies en mode impression).
- **Export laser** : un seul SVG en mm. On y trouve la base à découper avec l'emplacement des lettres en marquage, puis les lettres à découper. xTool Studio crée directement les couches Cut et Score.
- **Export impression 3D** : un 3MF avec un seul objet en deux pièces. Les lettres s'emboîtent dans une poche de la base (jeu réglable, ou 0 pour le multi-matériau). Dans Bambu Studio, le fichier s'ouvre avec une P1S, deux filaments Bambu PLA Basic aux couleurs choisies, les lettres sur le filament 2 et l'objet centré sur le plateau.
- **Partage** : les réglages sont gardés dans le navigateur et encodés dans l'URL.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires
npm run check    # vérification TypeScript / Svelte
npm run build    # build statique dans dist/
```

## Crédits

- **Icônes**, servies par [Iconify](https://iconify.design/) :
  - [Game Icons](https://game-icons.net/) (CC BY 3.0) ;
  - [Font Awesome](https://fontawesome.com/) (CC BY 4.0) ;
  - [Material Design Icons](https://pictogrammers.com/library/mdi/), [Material Symbols](https://fonts.google.com/icons), [MingCute](https://www.mingcute.com/) et [Remix Icon](https://remixicon.com/) (Apache 2.0) ;
  - [Bootstrap Icons](https://icons.getbootstrap.com/) et [Ant Design Icons](https://ant.design/components/icon) (MIT).
- **Polices** : Google Fonts via [Fontsource](https://fontsource.org/), sous SIL Open Font License 1.1 ou Apache 2.0.
- **Bibliothèques** : three.js, opentype.js et fflate (MIT), earcut (ISC), clipper-lib (Boost).

## Licence

MIT
