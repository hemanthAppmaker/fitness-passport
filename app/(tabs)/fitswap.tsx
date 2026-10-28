import React, { useState } from 'react';
import type { SectionKey } from '../../components/fitswap';
import {
  ContributionsSection,
  DiscoverSection,
  ExchangesSection,
  OfferHelpSection,
} from '../../components/fitswap-sections';

export default function FitSwapTab() {
  const [section, setSection] = useState<SectionKey>('discover');
  const shell = { section, onSection: setSection };
  switch (section) {
    case 'offer':
      return <OfferHelpSection {...shell} />;
    case 'exchanges':
      return <ExchangesSection {...shell} />;
    case 'contributions':
      return <ContributionsSection {...shell} />;
    default:
      return <DiscoverSection {...shell} />;
  }
}
