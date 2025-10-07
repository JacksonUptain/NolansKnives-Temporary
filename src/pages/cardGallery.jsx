import { Image, Card, Button } from 'react-bootstrap';
import "./main.css";

function CardGallery({ items }) {
    if (!items || items.length === 0) return null;

    return (
        <div className="cardGallery-wrapper">
            {items.map((item, index) => (
                <Card
                    key={index}
                    className="cardGallery"
                    style={{
                            position: 'relative',
                            border: '2px solid !important',
                            
                        }}
                >
                    <div className="cardGallery-text">
                        <h2>{item.title}</h2>
                        <p>{item.text}</p>
                        <Button variant="warning" href={item.href} className="cardGallery-button">
                            {item.hrefText}
                        </Button>
                    </div>
                    {item.src && (
                        <Image
                            src={`https://raw.githubusercontent.com/JacksonUptain/nolans-knives-image-database/refs/heads/main/${item.src}`}
                            alt={item.title}
                            className="cardGallery-image"
                        />
                    )}
                </Card>
            ))}
        </div>
    );
}

export default CardGallery;
