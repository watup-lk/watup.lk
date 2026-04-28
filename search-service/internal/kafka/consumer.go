package kafka

import (
	"context"
	"log"

	"github.com/segmentio/kafka-go"
)

const (
	topicThresholdReached    = "threshold-reached"
	topicSubmissionCreated   = "salary.submission_created"
)

// Consumer subscribes to salary events so the search service is aware of
// new submissions (salary.submission_created) and approvals (threshold-reached).
// Search reads live from PostgreSQL, so no in-memory cache needs invalidating —
// the consumer exists to make event participation explicit and observable.
type Consumer struct {
	approvalReader    *kafka.Reader
	submissionReader  *kafka.Reader
}

func NewConsumer(brokers []string) *Consumer {
	return &Consumer{
		approvalReader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:  brokers,
			Topic:    topicThresholdReached,
			GroupID:  "search-service",
			MinBytes: 1,
			MaxBytes: 1 << 20,
		}),
		submissionReader: kafka.NewReader(kafka.ReaderConfig{
			Brokers:  brokers,
			Topic:    topicSubmissionCreated,
			GroupID:  "search-service",
			MinBytes: 1,
			MaxBytes: 1 << 20,
		}),
	}
}

// Run starts both topic consumers concurrently and blocks until ctx is cancelled.
func (c *Consumer) Run(ctx context.Context) {
	log.Printf("[kafka] consumer started — topics=%s,%s group=search-service",
		topicThresholdReached, topicSubmissionCreated)

	done := make(chan struct{}, 2)
	go func() {
		c.consume(ctx, c.approvalReader, "approval")
		done <- struct{}{}
	}()
	go func() {
		c.consume(ctx, c.submissionReader, "submission")
		done <- struct{}{}
	}()

	<-done
	<-done
	log.Println("[kafka] consumer stopped")
}

func (c *Consumer) consume(ctx context.Context, r *kafka.Reader, label string) {
	defer func() {
		if err := r.Close(); err != nil {
			log.Printf("[kafka] %s reader close error: %v", label, err)
		}
	}()
	for {
		msg, err := r.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[kafka] %s fetch error: %v", label, err)
			continue
		}
		log.Printf("[kafka] %s event received — topic=%s key=%s",
			label, msg.Topic, string(msg.Key))

		if err := r.CommitMessages(ctx, msg); err != nil {
			log.Printf("[kafka] %s commit error: %v", label, err)
		}
	}
}
