import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EstimatorMarkdown } from '@/components/estimator-markdown'

describe('EstimatorMarkdown', () => {
  it('renders headings, lists, and tables instead of a flat dump', () => {
    const html = renderToStaticMarkup(
      createElement(EstimatorMarkdown, {
        text: [
          '### Assembly Mapping Summary',
          '* **Assigned Assembly:** `26.21.11.`',
          '',
          '| Component | Qty | Unit |',
          '| :--- | :--- | :--- |',
          '| **Concrete** | 14.5 | m³ |',
        ].join('\n'),
      }),
    )
    expect(html).toContain('Assembly Mapping Summary')
    expect(html).toContain('<ul')
    expect(html).toContain('<table')
    expect(html).toContain('Concrete')
    expect(html).toContain('26.21.11.')
  })
})
