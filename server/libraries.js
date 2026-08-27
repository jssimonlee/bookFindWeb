export const LIBRARIES = Object.freeze([
  { id: "ALL", name: "전체도서관", sitePath: "intro", aliases: [] },
  { id: "MK", name: "화성동탄중앙", sitePath: "dtlib", aliases: ["동탄복합문화센터도서관", "화성동탄중앙도서관"] },
  { id: "MA", name: "남양", sitePath: "nylib", openDataName: "화성시립남양도서관", aliases: ["남양도서관"] },
  { id: "MB", name: "태안", sitePath: "talib", openDataName: "화성시립태안도서관", aliases: ["태안도서관"] },
  { id: "MC", name: "삼괴", sitePath: "sglib", openDataName: "화성시립삼괴도서관", aliases: ["삼괴도서관"] },
  { id: "MD", name: "병점", sitePath: "bjlib", openDataName: "화성시립병점도서관", aliases: ["병점도서관"] },
  { id: "MG", name: "봉담", sitePath: "bdlib", openDataName: "화성시립봉담도서관", aliases: ["봉담도서관"] },
  { id: "ML", name: "송산", sitePath: "sslib", openDataName: "화성시립송산도서관", aliases: ["송산도서관"] },
  { id: "MM", name: "정남", sitePath: "jnlib", openDataName: "화성시립정남도서관", aliases: ["정남도서관"] },
  { id: "MO", name: "진안", sitePath: "jalib", openDataName: "화성시립진안도서관", aliases: ["진안도서관"] },
  { id: "MW", name: "왕배푸른숲", sitePath: "wblib", openDataName: "화성시립왕배푸른숲도서관", aliases: ["왕배푸른숲도서관", "왕배도서관"] },
  { id: "MX", name: "노을빛", sitePath: "neblib", openDataName: "화성시립노을빛도서관", aliases: ["노을빛도서관"] },
  { id: "NA", name: "향남복합문화센터", sitePath: "hnlib", openDataName: "화성시립향남복합문화센터도서관", aliases: ["향남복합문화센터도서관"] },
  { id: "NB", name: "봉담와우", sitePath: "bwlib", openDataName: "화성시립봉담와우도서관", aliases: ["봉담와우도서관"] },
  { id: "MP", name: "중앙이음터", sitePath: "iutlib", openDataName: "화성시립동탄중앙이음터도서관", aliases: ["중앙이음터도서관"] },
  { id: "MR", name: "다원이음터", sitePath: "dwlib", openDataName: "화성시립동탄다원이음터도서관", aliases: ["다원이음터도서관"] },
  { id: "MS", name: "송린이음터", sitePath: "srlib", openDataName: "화성시립송린이음터도서관", aliases: ["송린이음터도서관"] },
  { id: "MF", name: "두빛나래", sitePath: "dbnarae", openDataName: "화성시립두빛나래어린이도서관", aliases: ["두빛나래어린이도서관"] },
  { id: "MI", name: "목동이음터", sitePath: "mdlib", openDataName: "화성시립동탄목동이음터도서관", aliases: ["목동이음터도서관"] },
  { id: "MY", name: "서연이음터", sitePath: "sylib", openDataName: "화성시립서연이음터도서관", aliases: ["서연이음터도서관"] },
  { id: "MH", name: "둥지나래", sitePath: "djnarae", openDataName: "화성시립둥지나래어린이도서관", aliases: ["둥지나래어린이도서관"] },
  { id: "TB", name: "달빛나래", sitePath: "mlnarae", openDataName: "화성시립달빛나래어린이도서관", aliases: ["달빛나래어린이도서관"] },
  { id: "ME", name: "샘내", sitePath: "small", openDataName: "화성시립샘내작은도서관", aliases: ["샘내작은도서관"] },
  { id: "MJ", name: "기아행복마루", sitePath: "small", openDataName: "화성시립기아행복마루작은도서관", aliases: ["기아행복마루작은도서관", "기아도서관"] },
  { id: "MN", name: "비봉", sitePath: "small", openDataName: "화성시립비봉작은도서관", aliases: ["비봉작은도서관"] },
  { id: "MU", name: "마도", sitePath: "small", openDataName: "화성시립마도작은도서관", aliases: ["마도작은도서관"] },
  { id: "MT", name: "팔탄", sitePath: "small", openDataName: "화성시립팔탄작은도서관", aliases: ["팔탄작은도서관"] },
  { id: "MQ", name: "양감", sitePath: "small", openDataName: "화성시립양감작은도서관", aliases: ["양감작은도서관"] },
  { id: "MV", name: "봉담커피앤북", sitePath: "small", openDataName: "화성시립봉담커피앤북작은도서관", aliases: ["봉담커피앤작은도서관", "봉담커피도서관"] },
  { id: "TA", name: "늘봄이음터", sitePath: "small", openDataName: "화성시립늘봄이음터작은도서관", aliases: ["늘봄이음터작은도서관"] },
  { id: "MZ", name: "호연이음터", sitePath: "small", openDataName: "화성시립호연이음터작은도서관", aliases: ["호연이음터작은도서관"] },
  { id: "TC", name: "서신", sitePath: "small", openDataName: "화성시립서신작은도서관", aliases: ["서신작은도서관"] },
  { id: "TD", name: "가족만세센터", sitePath: "small", aliases: ["만세도서관", "화성시가족센터도서관"] }
]);

export function findLibrary(id) {
  return LIBRARIES.find((library) => library.id === id) ?? null;
}
