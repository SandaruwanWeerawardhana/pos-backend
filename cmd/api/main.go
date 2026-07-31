package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	internalapp "github.com/SandaruwanWeerawardhana/pos-backend/internal/app"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	container, err := internalapp.NewContainer(ctx)
	if err != nil {
		return err
	}
	app := internalapp.New(container)

	listenErr := make(chan error, 1)
	go func() {
		container.Logger.Info("api listening", "address", container.Config.HTTP.Addr())
		listenErr <- app.Listen(container.Config.HTTP.Addr())
	}()

	select {
	case err = <-listenErr:
		if err != nil {
			_ = container.Close()
			return err
		}
	case <-ctx.Done():
		container.Logger.Info("api shutdown requested")
		if err = app.ShutdownWithTimeout(container.Config.HTTP.ShutdownTimeout); err != nil {
			container.Logger.Error("api shutdown failed", "error", err)
		}
	}

	if closeErr := container.Close(); closeErr != nil && err == nil {
		err = closeErr
	}
	return err
}
