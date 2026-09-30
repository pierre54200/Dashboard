// Convertit toutes les tailles de texte en px des fichiers CSS du frontend en rem,
// pour qu'elles suivent le réglage "Taille du texte" (et la taille choisie dans le navigateur).
//
// Utilisation, depuis le dossier frontend :  node px-to-rem.mjs
// Le script modifie les fichiers en place : commitez ou sauvegardez avant de le lancer.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const BASE = 16; // 1rem = 16px par défaut
const PATTERN = /font-size:(\s*)(\d+(?:\.\d+)?)px/g;

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* cssFiles(path);
    else if (name.endsWith(".css")) yield path;
  }
}

let total = 0;
for (const file of cssFiles(ROOT)) {
  const css = readFileSync(file, "utf8");
  let count = 0;
  const out = css.replace(PATTERN, (_, space, px) => {
    count++;
    const rem = Number((Number(px) / BASE).toFixed(4));
    return `font-size:${space}${rem}rem`;
  });
  if (count > 0) {
    writeFileSync(file, out);
    console.log(`${file} : ${count} taille(s) convertie(s)`);
    total += count;
  }
}
console.log(`Terminé : ${total} taille(s) convertie(s).`);
