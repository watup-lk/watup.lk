package kafka

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

const topicSubmissionCreated = "salary.submission_created"

type submissionEvent struct {
	SubmissionID string `json:"submission_id"`
	EventType    string `json:"event_type"`
	Timestamp    string `json:"timestamp"`
}

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokers []string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr:                   kafka.TCP(brokers...),
			Topic:                  topicSubmissionCreated,
			Balancer:               &kafka.LeastBytes{},
			AllowAutoTopicCreation: true,
		},
	}
}

func (p *Producer) PublishSubmissionCreated(ctx context.Context, submissionID string) {
	payload, err := json.Marshal(submissionEvent{
		SubmissionID: submissionID,
		EventType:    topicSubmissionCreated,
		Timestamp:    time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		log.Printf("[kafka] marshal error: %v", err)
		return
	}
	if err := p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(submissionID),
		Value: payload,
	}); err != nil {
		log.Printf("[kafka] publish %s failed: %v", topicSubmissionCreated, err)
	}
}

func (p *Producer) Close() {
	if err := p.writer.Close(); err != nil {
		log.Printf("[kafka] error closing writer: %v", err)
	}
}
