import { useMutation } from '@tanstack/react-query';
import { scanToken } from '../lib/api';

export function useScan() {
  return useMutation({
    mutationFn: (tokenMint: string) => scanToken(tokenMint),
  });
}
