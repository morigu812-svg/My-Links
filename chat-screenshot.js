async function encodeChatScreenshot(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('画像は25 MB以下にしてください。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve,reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('画像を開けませんでした。'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    for (const limit of [1600,1300,1050,800,600,400]) {
      const scale = Math.min(1,limit/longest);
      canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
      context.fillStyle = '#fff';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const data = canvas.toDataURL('image/jpeg',0.83);
      if (data.startsWith('data:image/jpeg;base64,') && data.length<=130000) return data;
    }
    throw new Error('送信できるサイズに変換できませんでした。');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pastedChatImage(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return null;
  const file = Array.from(clipboard.files || []).find(file => file.type.startsWith('image/')) ||
    Array.from(clipboard.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
  if (!file) return null;
  event.preventDefault();
  return file;
}
