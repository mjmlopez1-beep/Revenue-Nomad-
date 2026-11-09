# 02: Research bar, hero, firm numbers, logo marquee

**What to build:** The first screen of Homepage D: research bar, header, hero with glass mark and two actions, four firm numbers with confirm badges, and the client logo marquee (hidden until six logo files exist).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Copy matches content appendix sections 0 to 5; headline italic phrase in forest, full stop in coral
- [ ] Glass mark via `next/image` from `public/home/glass-mark.webp` (980 by 984), sized 539 wide on desktop, below the copy on phones, with the glow from `--rn-hero-glow`
- [ ] FirmNumbers reads four entries from `numbers.ts` and shows the badge unless `NEXT_PUBLIC_SITE_ENV=production`
- [ ] LogoMarquee: CSS animation, one loop about 40 s, pause/play button, static row under reduced motion, renders nothing when fewer than six logos have files
- [ ] One primary button in the hero (Talk to us); the check is the secondary style
- [ ] Checks pass at both viewports
