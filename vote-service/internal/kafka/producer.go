package kafka

import (
	"context"
	"fmt"
	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokers []string, topic string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr: kafka.TCP(brokers...),
			Topic: topic,
			Balancer: &kafka.LeastBytes{},
		},
	}
}

func (p *Producer) PublishThresholdReached(ctx context.Context, submissionID string) error {
	msg := kafka.Message{
		Key: []byte(submissionID),
		Value: []byte(fmt.Sprintf("Submission %s reached upvote threshold", submissionID)),
	}
	return p.writer.WriteMessages(ctx, msg)
}

func (p *Producer) Close() error {
	return p.writer.Close()
}
