import { Carousel, CarouselItem, CarouselCaption, Image } from 'react-bootstrap';
import "./main.css"
function TimedCarousel({ items }) {
    if (!items || items.length === 0) {
        return null; // Render nothing if there are no items
    }

    return (
        <Carousel
            style={{
                backgroundColor: "black",
                position: "sticky",
                top: "0px",
                width: "100%"
            }}
            >
            {items.map((item, index) => (
                <CarouselItem key={index} interval={item.interval}>
                <img
                    className="d-block w-100"
                    src={`https://raw.githubusercontent.com/JacksonUptain/nolans-knives-image-database/refs/heads/main/${item.src}`}
                    alt={item.name}
                />
                <CarouselCaption>
                    <h3>{item.name}</h3>
                    <p>{item.caption}</p>
                </CarouselCaption>
                </CarouselItem>
            ))}
        </Carousel>


    );
}

export default TimedCarousel;
