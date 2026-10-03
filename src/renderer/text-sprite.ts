import { CanvasTexture, Sprite, SpriteMaterial } from 'three'

export const createTextSprite = (text: string, color = '#c3cedb'): Sprite => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Text labels require a 2D canvas context')
  context.font = '500 40px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  context.fillText(text, 64, 32)
  const sprite = new Sprite(
    new SpriteMaterial({
      map: new CanvasTexture(canvas),
      depthTest: false,
      depthWrite: false,
    }),
  )
  sprite.scale.set(0.64, 0.32, 1)
  return sprite
}
