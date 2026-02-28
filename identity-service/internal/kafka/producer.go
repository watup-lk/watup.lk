package kafka

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

const (
	topicUserRegistered = "user.registered"
	topicUserLogin      = "user.login"
)

// userEvent is the Kafka message payload for user lifecycle events.
type userEvent struct {
	UserID    string `json:"user_id"`
	EventType string `json:"event_type"`
	Timestamp string `json:"timestamp"`
}

// Producer wraps kafka-go writers for user event topics.
type Producer struct {
	registeredWriter *kafka.Writer
	loginWriter      *kafka.Writer
}

func NewProducer(brokers []string) *Producer {
	newWriter := func(topic string) *kafka.Writer {
		return &kafka.Writer{
			Addr:                   kafka.TCP(brokers...),
			Topic:                  topic,
			Balancer:               &kafka.LeastBytes{},
			AllowAutoTopicCreation: true,
		}
	}
	return &Producer{
		registeredWriter: newWriter(topicUserRegistered),
		loginWriter:      newWriter(topicUserLogin),
	}
}

// PublishUserRegistered sends a user.registered event. Intended to be called in a goroutine.
func (p *Producer) PublishUserRegistered(ctx context.Context, userID string) {
	p.publish(ctx, p.registeredWriter, userID, "user.registered")
}

// PublishUserLogin sends a user.login event. Intended to be called in a goroutine.
func (p *Producer) PublishUserLogin(ctx context.Context, userID string) {
	p.publish(ctx, p.loginWriter, userID, "user.login")
}

func (p *Producer) publish(ctx context.Context, w *kafka.Writer, userID, eventType string) {
	payload, err := json.Marshal(userEvent{
		UserID:    userID,
		EventType: eventType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		log.Printf("[kafka] failed to marshal event %s: %v", eventType, err)
		return
	}

	msg := kafka.Message{
		Key:   []byte(userID),
		Value: payload,
	}
	if err := w.WriteMessages(ctx, msg); err != nil {
		log.Printf("[kafka] failed to publish %s for user %s: %v", eventType, userID, err)
	}
}

func (p *Producer) Close() {
	if err := p.registeredWriter.Close(); err != nil {
		log.Printf("[kafka] error closing registered writer: %v", err)
	}
	if err := p.loginWriter.Close(); err != nil {
		log.Printf("[kafka] error closing login writer: %v", err)
	}
}
