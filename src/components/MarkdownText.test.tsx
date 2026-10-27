import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownText } from './MarkdownText';

describe('MarkdownText', () => {
  it('renders headings, lists and bold content without raw markdown markers', () => {
    render(<MarkdownText content={'# 菜品文案\n\n**现点现焖**\n- 菌香浓郁'} />);
    expect(screen.getByRole('heading', { name: '菜品文案' })).toBeInTheDocument();
    expect(screen.getByText('现点现焖', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('菌香浓郁')).toBeInTheDocument();
  });
});
