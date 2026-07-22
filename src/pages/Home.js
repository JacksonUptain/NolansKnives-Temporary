import 'bootstrap/dist/css/bootstrap.min.css';
import "./main.css"
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from './firebase';

import TimedCarousel from "./TimedCarousel"
import StackedCards from "./StackedCards"
import AutoScrollToTop from './autoScrollToTop';

const items = [{name: "QUALITY", interval: 4500, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife2.jpg", caption: " "},
  {name: "DURABILITY", interval: 3000, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife4.jpg", caption: " "},
  {name: "ARTISTRY", interval: 3000, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife7.jpg", caption: " "}];

const fallbackCards = [
  {title: "Nolan's Knives", text: "Each knife is forged with precision and passion, whether it’s built for everyday use, outdoor adventure, or display as a one-of-a-kind piece", hrefText: "Go to Store", href: "/Store", src: "/images/knife6.jpg"},
  {title: "Nolan's Brand", text: "With a focus on traditional techniques blended with modern innovation, Nolan’s Knives delivers tools that are not only sharp and reliable, but also showcase unique designs and materials", hrefText: "View Previous Works", href:"/Gallery", src: "/images/knife5.jpg"},
  {title: "Nolan's Workshop", text: "Every blade is made to be trusted in the hand and admired for a lifetime", hrefText: "View the Store", href:"/Store", src: "/images/knife2.jpg"},
  {title: "Nolan's Channel", text: `"I am a 16 year old self taught blacksmith, who loves the art of blade smithing and strives to always learn more and make better knives"`, hrefText: "Learn More", href: "https://www.youtube.com/@NolansKnives", src: "/images/YouTubeLogo.png"},
  {title: "Nolan's Instagram", text: "Follow Nolan's Knives on Instagram!", hrefText: "Learn More", href: "https://www.instagram.com/nolansknives/", src: "/images/nolans_logo.jpg"},
  {title: "Nolan's Gallery", text: "Browse finished work, experiments, and past builds from the shop.", hrefText: "View Gallery", href: "/Gallery", src: "/images/knife8.jpg"},
]

export default function Home() {
  const [cards, setCards] = useState(fallbackCards);

  useEffect(() => {
    const homeRef = ref(db, 'Home');
    const unsubscribe = onValue(homeRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setCards(fallbackCards);
        return;
      }

      const fromDb = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
        // If a legacy entry stores multiple images, keep first for stacked card layout.
        src: Array.isArray(value?.src) ? value.src[0] : value?.src
      })).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (a.title || "").localeCompare(b.title || ""));

      setCards(fromDb.length > 0 ? fromDb : fallbackCards);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div id="MainContainerDiv">
      <AutoScrollToTop />
      <TimedCarousel items={items} />
      <StackedCards items={cards}/>
    </div>
  );
}
