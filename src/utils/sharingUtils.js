import { numeroALetras } from './numeroALetras';
import { calculateTaxBreakdown } from './posMath';
import * as htmlToImage from 'html-to-image';

export const convertLogoToESCPOS = async (base64Data) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Data;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const MAX_WIDTH = 300;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      width = Math.ceil(width / 8) * 8;
      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;

      const widthBytes = width / 8;
      const xL = widthBytes % 256;
      const xH = Math.floor(widthBytes / 256);
      const yL = height % 256;
      const yH = Math.floor(height / 256);

      const header = [0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH];
      const imageBytes = [];

      let currentByte = 0;
      let bitIndex = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        const isBlack = (a > 128) && ((r * 0.299 + g * 0.587 + b * 0.114) < 128);

        if (isBlack) {
          currentByte |= (1 << (7 - bitIndex));
        }

        bitIndex++;

        if (bitIndex === 8) {
          imageBytes.push(currentByte);
          currentByte = 0;
          bitIndex = 0;
        }
      }

      resolve(new Uint8Array([...header, ...imageBytes]));
    };
  });
};

export const printRawReceipt = async (ticket, total, options = {}) => {
  const { t, lang, receiptSettings } = options;
  try {
    const encoder = new TextEncoder();
    let receiptBuffer = [];

    const ESC_INIT = [0x1B, 0x40];
    const ESC_ALIGN_LEFT = [0x1B, 0x61, 0x00];
    const ESC_ALIGN_CENTER = [0x1B, 0x61, 0x01];
    const ESC_BOLD_ON = [0x1B, 0x45, 0x01];
    const ESC_BOLD_OFF = [0x1B, 0x45, 0x00];

    const pushCommand = (cmdArray) => receiptBuffer.push(...cmdArray);
    const stripEmojis = (str) => {
      if (!str) return "";
      return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    };
    const pushText = (text) => receiptBuffer.push(...encoder.encode(text));
    const pushRow = (leftText, rightText) => {
      const cleanLeft = stripEmojis(leftText);
      const spacesNeeded = Math.max(1, 32 - cleanLeft.length - rightText.length);
      pushText(`${cleanLeft}${' '.repeat(spacesNeeded)}${rightText}\n`);
    };

    pushCommand(ESC_INIT);
    pushCommand(ESC_ALIGN_CENTER);

    if (receiptSettings.logo) {
      try {
        const logoBytes = await convertLogoToESCPOS(receiptSettings.logo);
        pushCommand(Array.from(logoBytes));
        pushText("\n");
      } catch (e) {
        console.warn("Could not process logo:", e);
      }
    }

    pushCommand(ESC_BOLD_ON);
    pushText(`${receiptSettings.header}\n`);
    pushCommand(ESC_BOLD_OFF);
    pushText(`${receiptSettings.subheader}\n`);
    pushText("--------------------------------\n");
    pushText(`${t('receipt.ticket')} ${ticket.name}\n`);
    const date = ticket.created_at ? new Date(ticket.created_at) : new Date();
    pushText(`${t('receipt.date')} ${date.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}\n`);
    pushText("--------------------------------\n");

    pushCommand(ESC_ALIGN_LEFT);

    let rawSubtotal = 0;
    for (const item of ticket.items) {
      const qty = item.qty || 1;
      
      // LEGACY DETECTOR for menu items
      let itemBase = item.basePrice || 0;
      if (itemBase > 0 && itemBase < 2000) itemBase *= 100;
      
      let lineTotal = itemBase;
      
      const modRows = [];
      for (const mod of (item.selectedModifiers || [])) {
        let modP = mod.price || 0;
        if (modP > 0 && modP < 1000) modP *= 100;
        lineTotal += modP;
        
        const modLabel = `  + ${mod.name}${mod.textValue ? ': ' + mod.textValue : ''}`;
        const modPriceStr = modP > 0 ? `+$${(modP / 100).toFixed(2)}` : "";
        modRows.push({ label: modLabel, price: modPriceStr });
      }
      
      lineTotal *= qty;
      rawSubtotal += lineTotal;

      const itemLabel = qty > 1 ? `${item.name} x${qty}` : item.name;
      pushRow(itemLabel, `$${((itemBase * qty) / 100).toFixed(2)}`);

      for (const row of modRows) {
        pushRow(row.label, row.price);
      }
    }

    pushText("--------------------------------\n");

    if (rawSubtotal > total) {
      pushRow(t('analytics.grossRevenue'), `$${(rawSubtotal / 100).toFixed(2)}`);
      pushRow(t('disc.title'), `-$${((rawSubtotal - total) / 100).toFixed(2)}`);
      pushText("--------------------------------\n");
    }

    if (receiptSettings.enableTaxBreakdown) {
      const taxRate = receiptSettings.taxRate || 16;
      const { subtotal: baseSubtotal, tax: extractedTax } = calculateTaxBreakdown(total, taxRate);
      pushRow("Subtotal ", `$${(baseSubtotal / 100).toFixed(2)}`);
      pushRow(`IVA (${taxRate}%)`, `$${(extractedTax / 100).toFixed(2)}`);
      pushText("--------------------------------\n");
    }

    pushCommand(ESC_ALIGN_CENTER);
    pushCommand(ESC_BOLD_ON);
    pushText(`TOTAL: $${(total / 100).toFixed(2)}\n`);
    pushCommand(ESC_BOLD_OFF);
    pushText(`${numeroALetras(total / 100)}\n`);
    pushText("--------------------------------\n");
    pushText(`${receiptSettings.footer}\n`);
    pushText("\n\n\n");

    const finalBytes = new Uint8Array(receiptBuffer);
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      let binary = '';
      for (let i = 0; i < finalBytes.byteLength; i++) {
        binary += String.fromCharCode(finalBytes[i]);
      }
      const base64Data = window.btoa(binary);
      const rawbtUrl = `rawbt:base64,${base64Data}`;
      const link = document.createElement('a');
      link.href = rawbtUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
    } else if (navigator.serial) {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      const writer = port.writable.getWriter();
      await writer.write(finalBytes);
      writer.releaseLock();
      await port.close();
    } else {
      throw new Error("unsupported");
    }
  } catch (err) {
    console.error("Printing failed:", err);
    throw err;
  }
};

export const sendFinalMessage = (phone, ticket, total, options = {}) => {
  const { t, lang, receiptSettings, loyaltyData } = options;
  if (!ticket) return;

  let message = `*${receiptSettings.header}*\n`;
  if (receiptSettings.subheader) {
    message += `${receiptSettings.subheader}\n`;
  }
  message += `--------------------------\n`;
  message += `${t('wa.order')} ${ticket.name}\n`;
  const date = ticket.created_at ? new Date(ticket.created_at) : new Date();
  message += `${t('wa.date')} ${date.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}\n`;
  message += `--------------------------\n`;

  ticket.items.forEach(item => {
    const qty = item.qty || 1;
    const baseTotal = (item.basePrice * qty) / 100;
    const qtyLabel = qty > 1 ? ` x${qty}` : '';
    message += `${item.emoji || '☕'} ${item.name}${qtyLabel} - $${baseTotal.toFixed(2)}\n`;
    if (item.selectedModifiers && item.selectedModifiers.length > 0) {
      item.selectedModifiers.forEach(mod => {
        if (mod.textValue) {
          message += `  + ${mod.name}: "${mod.textValue}"\n`;
        } else {
          message += `  + ${mod.name}${mod.price > 0 ? ` (+$${(mod.price / 100).toFixed(2)})` : ''}\n`;
        }
      });
    }
  });

  message += `--------------------------\n`;

  if (receiptSettings.enableTaxBreakdown) {
    const taxRate = receiptSettings.taxRate || 16;
    const { subtotal: baseSubtotal, tax: extractedTax } = calculateTaxBreakdown(total, taxRate);
    message += `Subtotal: $${(baseSubtotal / 100).toFixed(2)}\n`;
    message += `IVA (${taxRate}%): $${(extractedTax / 100).toFixed(2)}\n`;
  }

  message += `--------------------------\n`;
  message += `*TOTAL: $${(total / 100).toFixed(2)}*\n`;
  message += `_${numeroALetras(total / 100)}_\n`;

  if (loyaltyData) {
    message += `--------------------------\n`;
    message += `\n🌟 *${t('wa.loyaltyTitle')}*\n`;
    message += `${t('analytics.filterAll')}: ${loyaltyData.visits} / ${loyaltyData.target}\n`;
    message += `(${t('wa.earnedToday')} +${loyaltyData.earnedToday})\n`;

    if (loyaltyData.isRewardReady) {
      message += `🎉 ${t('wa.rewardReady')} ${loyaltyData.reward}!\n`;
    } else {
      message += `${t('wa.nextReward')} ${loyaltyData.target - (loyaltyData.visits % loyaltyData.target)} ${t('wa.more')}!\n`;
    }
  }

  message += `--------------------------\n`;
  message += `\n${receiptSettings.footer}`;

  const encodedMessage = encodeURIComponent(message);
  const targetPhone = `52${phone}`;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const whatsappUrl = isMobile
    ? `whatsapp://send?phone=${targetPhone}&text=${encodedMessage}`
    : `https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodedMessage}`;

  if (isMobile) {
    window.location.assign(whatsappUrl);
  } else {
    window.open(whatsappUrl, '_blank');
  }
};

export const saveTicketAsPNG = async (elementId, fileName = 'ticket.png') => {
  const node = document.getElementById(elementId);
  if (!node) return;

  try {
    // PASS 1: Warm up (Fixes Safari/iOS missing image bug)
    // We call toPng once to force the browser to decode and cache images in the cloned DOM
    await htmlToImage.toPng(node);
    
    // Tiny delay to let the rendering engine breathe
    await new Promise(resolve => setTimeout(resolve, 150));

    // PASS 2: Actual capture
    const dataUrl = await htmlToImage.toPng(node, { 
      backgroundColor: '#fff',
      pixelRatio: 2, // Higher quality for mobile sharing
      style: {
        borderRadius: '0'
      }
    });

    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('oops, something went wrong!', error);
    throw error;
  }
};
