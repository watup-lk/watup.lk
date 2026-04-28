package kafka

import (
	"context"
	"log"

	"github.com/segmentio/kafka-go"
)

const topicThresholdReached = "threshold-reached"

type Approver interface {
	ApproveSubmission(ctx context.Context, submissionID string) error
}

type Consumer struct {
	reader   *kafka.Reader
	approver Approver
}

func NewConsumer(brokers []string, approver Approver) *Consumer {
	return &Consumer{
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:  brokers,
			Topic:    topicThresholdReached,
			GroupID:  "salary-service",
			MinBytes: 1,
			MaxBytes: 1 << 20, // 1 MB
		}),
		approver: approver,
	}
}

// Run blocks, consuming messages until ctx is cancelled.
func (c *Consumer) Run(ctx context.Context) {
	log.Printf("[kafka] consumer started — topic=%s group=salary-service", topicThresholdReached)
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			log.Printf("[kafka] fetch error: %v", err)
			continue
		}

		submissionID := string(msg.Key)
		log.Printf("[kafka] threshold-reached received — submission_id=%s", submissionID)

		if err := c.approver.ApproveSubmission(ctx, submissionID); err != nil {
			log.Printf("[kafka] approve failed submission_id=%s: %v", submissionID, err)
			// do not commit — message will be redelivered
			continue
		}

		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("[kafka] commit error: %v", err)
		}
	}
	if err := c.reader.Close(); err != nil {
		log.Printf("[kafka] consumer close error: %v", err)
	}
	log.Println("[kafka] consumer stopped")
}
