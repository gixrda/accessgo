/**
 * Da una frase detta a voce ("Portami in Piazza dei Cavalieri.") ricava il luogo da cercare ("Piazza dei Cavalieri").
 * Solo regole: nessuna coordinata viene inventata, il risultato va comunque scelto dall'elenco.
 */
export function spokenPlaceQuery(text: string): string {
  return text
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/^(?:ehi|ok|allora|per favore|per piacere)[,\s]+/i, '')
    .replace(/^(?:portami|accompagnami|vai|andiamo|voglio andare|vorrei andare|devo andare|cerca|trova|cercami|trovami|mostrami|percorso|itinerario|destinazione|arrivo|partenza|parto|parti)\b[,\s]*/i, '')
    .replace(/^(?:il percorso|un percorso|la strada)\s+/i, '')
    .replace(/^(?:per|verso|fino a|fino in|a|in|al|allo|alla|ai|agli|alle|da|dal|dallo|dalla|dai|dagli|dalle)\s+/i, '')
    .replace(/[,\s]+per favore$/i, '')
    .trim();
}
