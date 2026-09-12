import type { Metadata } from 'next';
import { Simulator } from '../components/Simulator';

export const metadata: Metadata = {
  title: 'WhatsApp Messaging Simulator · Dyvit',
};

export default function Page() {
  return <Simulator />;
}
