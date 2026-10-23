export function ruleBodies(styles: string, selector: string): string[] {
  const bodies: string[] = [];
  // 先剥掉注释：规则上方的注释会粘进选择器捕获组，导致带注释的规则查不到。
  const commentFree = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of commentFree.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((item) => item.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  if (bodies.length === 0) throw new Error(`Missing CSS rule for ${selector}`);
  return bodies;
}

