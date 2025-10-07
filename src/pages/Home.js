

import "./main.css"

import 'bootstrap/dist/css/bootstrap.min.css';
import TimedCarousel from "./TimedCarousel"
import StackedCards from "./StackedCards"
import AutoScrollToTop from './autoScrollToTop';


const items = [{name: "QUALITY", interval: 4500, src: "/images/knife2.jpg", caption: " "}, 
  {name: "DURABILITY", interval: 3000, src: "/images/knife4.jpg", caption: " "}, 
  {name: "ARTISTRY", interval: 3000, src: "/images/knife7.jpg", caption: " "}];

const cards = [
  {title: "Nolan's Knives", text: "Each knife is forged with precision and passion, whether it’s built for everyday use, outdoor adventure, or display as a one-of-a-kind piece", hrefText: "Go to Store", href: "/Store", src: "/images/knife6.jpg"},
  {title: "Nolan's Brand", text: "With a focus on traditional techniques blended with modern innovation, Nolan’s Knives delivers tools that are not only sharp and reliable, but also showcase unique designs and materials", hrefText: "View Previous Works", href:"/Gallery", src: "/images/knife5.jpg"},
  {title: "Nolan's Goal", text: "Every blade is made to be trusted in the hand and admired for a lifetime", hrefText: "Learn More", href:"/Goal", src: "/images/knife2.jpg"},
  {title: "Nolan's Channel", text: `"I am a 16 year old self taught blacksmith, who loves the art of blade smithing and strives to always learn more and make better knives"`, hrefText: "Learn More", href: "https://www.youtube.com/@NolansKnives", src: "/images/nolansknives.jpg"},
  {title: "Nolan's Instagram", text: "Follow Nolan_Knives on Instagram!", hrefText: "Learn More", href: "https://www.instagram.com/nolan_knives/", src: "/images/insta-profile.jpg"},
  {title: "Nolan's Gallery", text: "Coming Soon", hrefText: "Learn More", href: "/GalleryPage", src: "/images/knife8.jpg"},
  
  
]

const galleryCards = [
 {title: "Nolan's Knives", text: "Each knife is forged with precision and passion, whether it’s built for everyday use, outdoor adventure, or display as a one-of-a-kind piece", hrefText: "Learn More", href: "href", src: "/images/knife6.jpg"},
]



export default function Home() {
  
  return (
    <div id="MainContainerDiv">
      <AutoScrollToTop />
      <TimedCarousel items={items} />
      <StackedCards items={cards}/>
    </div>
  );
}

