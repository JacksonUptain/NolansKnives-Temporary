import { Carousel, CarouselItem } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

function ProductCarousel({ items }) {
    if (!items || items.length === 0) {
        return null; // Render nothing if there are no items
    }
    
    return (

        <Carousel
            style={{
                backgroundColor: "black",
                top: "0px",
                width: "100%",
                
            }}
            >
            {items.map((item, index) => (
                <CarouselItem key={index} interval={4000}>
                <img
                    className="d-block w-100 h-50"
                    src={`https://raw.githubusercontent.com/JacksonUptain/nolans-knives-image-database/refs/heads/main/images/${item}`}
                    alt={item}
                />
                
                </CarouselItem>
            ))}
        </Carousel>


    );
}

export default ProductCarousel;
