import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '../src/components/ui/DropdownMenu';

afterEach(cleanup);

// Regression: DropdownMenuLabel used to be Base UI's <Menu.GroupLabel>, which
// throws "MenuGroupRootContext is missing" unless wrapped in <Menu.Group>. The
// Secrets/Expand menus use labels as plain dividers, so opening them white-screened
// the app (D-49 controls). The label must render anywhere in the popup.
describe('DropdownMenu', () => {
  it('renders a label + item outside a Menu.Group without crashing', () => {
    expect(() =>
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger render={<button>open</button>} />
          <DropdownMenuContent>
            <DropdownMenuLabel>Thinking</DropdownMenuLabel>
            <DropdownMenuItem>Expand</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      ),
    ).not.toThrow();
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Expand' })).toBeInTheDocument();
  });
});
