import type { CanvasNode, CanvasNodeData } from './canvasState';

export const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
export const categoryName = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 32) : '';

export function getNodeCategories(nodes: CanvasNode[]) {
  const colors = [...new Set([...CATEGORY_COLORS, ...nodes.map(node => node.data.color).filter((color): color is string => Boolean(color))])];
  return colors.map(color => {
    const members = nodes.filter(node => node.data.color === color);
    return { color, name: members.map(node => categoryName(node.data.categoryName)).find(Boolean) || '', ids: members.map(node => node.id) };
  });
}

export function assignNodeCategory(nodes: CanvasNode[], id: string, color: string): CanvasNode[] {
  const name = getNodeCategories(nodes).find(category => category.color === color)?.name;
  return nodes.map(node => node.id === id ? { ...node, data: { ...node.data, color: color || undefined, categoryName: name || undefined } } : node);
}

export function renameNodeCategory(nodes: CanvasNode[], color: string, name: string): CanvasNode[] {
  return nodes.map(node => node.data.color === color ? { ...node, data: { ...node.data, categoryName: categoryName(name) || undefined } } : node);
}

export function inheritNodeCategory(data?: CanvasNodeData): Partial<CanvasNodeData> {
  return data?.color ? { color: data.color, categoryName: categoryName(data.categoryName) || undefined } : {};
}
