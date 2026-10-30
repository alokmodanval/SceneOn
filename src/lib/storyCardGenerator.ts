import { SceneUser } from '../types';

export async function generateStoryCardBlob(user: SceneUser): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // 1. Dark obsidian background
  ctx.fillStyle = '#070709';
  ctx.fillRect(0, 0, 1080, 1920);

  // 2. Subtle neon glow blobs in background
  const grad1 = ctx.createRadialGradient(250, 400, 50, 250, 400, 600);
  grad1.addColorStop(0, 'rgba(139, 92, 246, 0.25)'); // Violet glow
  grad1.addColorStop(1, 'transparent');
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, 1080, 1000);

  const grad2 = ctx.createRadialGradient(850, 1400, 50, 850, 1400, 650);
  grad2.addColorStop(0, 'rgba(204, 255, 0, 0.2)'); // Acid lime glow
  grad2.addColorStop(1, 'transparent');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 800, 1080, 1120);

  // 3. Grid line accents
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 60; x < 1080; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1920);
    ctx.stroke();
  }
  for (let y = 60; y < 1920; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1080, y);
    ctx.stroke();
  }

  // 4. Outer Neo-Brutalist Frame
  ctx.strokeStyle = '#CCFF00';
  ctx.lineWidth = 8;
  ctx.strokeRect(40, 40, 1000, 1840);

  // Inner card container
  ctx.fillStyle = 'rgba(17, 17, 22, 0.9)';
  ctx.fillRect(80, 80, 920, 1760);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 80, 920, 1760);

  // 5. Header Brand & Tagline
  ctx.fillStyle = '#CCFF00';
  ctx.font = 'bold 36px "Space Grotesk", sans-serif';
  ctx.fillText('⚡ SCENEON', 130, 160);

  ctx.fillStyle = '#8B5CF6';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText('BY TOOLS4GENZ', 750, 160);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(130, 200);
  ctx.lineTo(950, 200);
  ctx.stroke();

  // 6. User Profile Section
  // Avatar Circle
  ctx.save();
  ctx.fillStyle = '#23232c';
  ctx.beginPath();
  ctx.arc(230, 320, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#CCFF00';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Emoji
  ctx.font = '72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(user.avatar?.emoji || '⚡', 230, 320);
  ctx.restore();

  // Alias & Key
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 54px "Space Grotesk", sans-serif';
  ctx.fillText(user.alias, 350, 310);

  ctx.fillStyle = '#CCFF00';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText(user.scene_key, 350, 355);

  // Aura Badge
  ctx.fillStyle = 'rgba(204, 255, 0, 0.15)';
  ctx.fillRect(740, 270, 200, 60);
  ctx.strokeStyle = '#CCFF00';
  ctx.lineWidth = 2;
  ctx.strokeRect(740, 270, 200, 60);

  ctx.fillStyle = '#CCFF00';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`+${user.scene_aura || 5} AURA ⚡`, 840, 308);
  ctx.textAlign = 'left';

  // 7. Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(130, 430);
  ctx.lineTo(950, 430);
  ctx.stroke();

  // 8. "AAJ KA SCENE" Icebreaker prompt card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(130, 470, 820, 180);
  ctx.strokeStyle = 'rgba(204, 255, 0, 0.3)';
  ctx.strokeRect(130, 470, 820, 180);

  ctx.fillStyle = '#CCFF00';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText('CURRENT SCENE & ICEBREAKER 💬', 160, 515);

  ctx.fillStyle = '#E5E7EB';
  ctx.font = 'italic 30px "Plus Jakarta Sans", sans-serif';
  const promptText = `"${user.scene_prompt || 'Aaj ka scene kya hai?'}"`;
  wrapText(ctx, promptText, 160, 565, 760, 42);

  // 9. Interest Pills
  ctx.fillStyle = '#A78BFA';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText('SCENE INTERESTS //', 130, 710);

  let pillX = 130;
  let pillY = 750;
  ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';

  (user.tags || []).slice(0, 6).forEach((tag) => {
    const textWidth = ctx.measureText(tag).width;
    const pillW = textWidth + 48;
    if (pillX + pillW > 950) {
      pillX = 130;
      pillY += 75;
    }

    ctx.fillStyle = '#1A1A24';
    ctx.fillRect(pillX, pillY, pillW, 56);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pillX, pillY, pillW, 56);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(tag, pillX + 24, pillY + 38);

    pillX += pillW + 20;
  });

  // 10. Vibe Sliders Section
  const sliderStartY = 970;
  ctx.fillStyle = '#00F0FF';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText('VIBE FREQUENCIES //', 130, sliderStartY);

  const sliders = [
    { label: 'Introvert 🤫 <---> Yapper 🗣️', val: user.sliders?.talk ?? 50, color: '#CCFF00' },
    { label: 'Night Owl 🦉 <---> Early Bird ☀️', val: user.sliders?.owl ?? 50, color: '#8B5CF6' },
    { label: 'Hustle ⚡ <---> Pure Chill 🍕', val: user.sliders?.hustle ?? 50, color: '#FF2E93' },
  ];

  sliders.forEach((sl, idx) => {
    const yPos = sliderStartY + 50 + idx * 105;

    ctx.fillStyle = '#D1D5DB';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(sl.label, 130, yPos);

    ctx.fillStyle = sl.color;
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${sl.val}%`, 950, yPos);
    ctx.textAlign = 'left';

    // Track
    const trackY = yPos + 18;
    ctx.fillStyle = '#1F1F2B';
    ctx.fillRect(130, trackY, 820, 16);

    // Active Fill
    ctx.fillStyle = sl.color;
    const fillWidth = (sl.val / 100) * 820;
    ctx.fillRect(130, trackY, fillWidth, 16);

    // Thumb circle
    ctx.beginPath();
    ctx.arc(130 + fillWidth, trackY + 8, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#070709';
    ctx.lineWidth = 4;
    ctx.stroke();
  });

  // 11. Viral Matching CTA Box
  const footerBoxY = 1380;
  ctx.fillStyle = 'rgba(204, 255, 0, 0.06)';
  ctx.fillRect(130, footerBoxY, 820, 270);
  ctx.strokeStyle = '#CCFF00';
  ctx.lineWidth = 3;
  ctx.strokeRect(130, footerBoxY, 820, 270);

  ctx.fillStyle = '#CCFF00';
  ctx.font = 'bold 28px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHECK OUR SCENE MATCH % ⚡', 540, footerBoxY + 60);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Zero-Login. 100% Free Forever. Find out if our vibes align:', 540, footerBoxY + 110);

  // Big link pill
  ctx.fillStyle = '#070709';
  ctx.fillRect(180, footerBoxY + 145, 720, 75);
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 2;
  ctx.strokeRect(180, footerBoxY + 145, 720, 75);

  ctx.fillStyle = '#00F0FF';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.fillText(`scene.tools4genz.com/?match=${user.id.slice(0, 8)}`, 540, footerBoxY + 192);

  // 12. Bottom Tagline
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText('AAJ KA SCENE KYA HAI? • 100% ZERO-LOGIN P2P', 540, 1780);

  return canvas.toDataURL('image/png');
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(' ');
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
