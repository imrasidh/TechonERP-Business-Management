import type { ComponentType } from 'react'

declare module '*.jsx' {
  const component: ComponentType<Record<string, unknown>>
  export default component
}