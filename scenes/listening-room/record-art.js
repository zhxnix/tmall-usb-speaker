/* Original geometric sleeve art, arranged to match the shop's existing atlas. */
window.createRecordAtlas = function () {
  const tile = 128;
  const canvas = document.createElement('canvas');
  canvas.width = 8 * tile;
  canvas.height = 6 * tile;
  const ctx = canvas.getContext('2d');
  const colors = ['#233744', '#725145', '#46465e', '#4e635e', '#8d6545', '#3f4d63', '#7b4a4a'];
  const inks = ['#d9b58e', '#d2d8cd', '#c48c68', '#adc4c6', '#e1c888'];
  for (let index = 0; index < 48; index++) {
    ctx.save();
    ctx.translate((index % 8) * tile, Math.floor(index / 8) * tile);
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(0, 0, tile, tile);
    ctx.strokeStyle = inks[(index * 3) % inks.length];
    ctx.strokeRect(8, 8, 112, 112);
    ctx.beginPath();
    ctx.rect(10, 10, 108, 108);
    ctx.clip();

    ctx.lineWidth = 1.4;
    for (let line = 0; line < 8; line++) {
      ctx.beginPath();
      if (index % 3 === 0) {
        ctx.arc(47 + index % 29, 52, 7 + line * 5, 0, 2 * Math.PI);
      } else if (index % 3 === 1) {
        ctx.moveTo(8, 92 - line * 6);
        ctx.bezierCurveTo(44, 17 + index, 77, 80 - line * 6, 121, 24 + line * 7);
      } else {
        const inset = 16 + line * 4;
        ctx.strokeRect(inset, 19 + line * 3, tile - 2 * inset, 68 - line * 6);
      }
      ctx.stroke();
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('WINTER SESSIONS', 15, 105);
    ctx.font = '7px monospace';
    ctx.fillText('SIDE A / ' + ('0' + (index + 1)).slice(-2), 15, 115);
    ctx.restore();
  }
  return canvas;
};
