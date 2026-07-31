// Command migrate runs goose migrations against the database configured by
// the same env vars/.env as the API server. Usage:
//
//	migrate up|down|down-to <version>|status|version
package main

import (
	"flag"
	"fmt"
	"log"
	"strconv"

	"github.com/SandaruwanWeerawardhana/pos-backend/config"
	"github.com/SandaruwanWeerawardhana/pos-backend/database"
)

func main() {
	flag.Parse()
	cmd := flag.Arg(0)
	if cmd == "" {
		log.Fatal("usage: migrate <up|down|down-to VERSION|status|version>")
	}

	cfg := config.MustLoad()

	db, err := database.NewPostgres(cfg.DB)
	if err != nil {
		log.Fatalf("migrate: connect: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("migrate: unwrap sql.DB: %v", err)
	}
	defer sqlDB.Close()

	migrator, err := database.NewMigrator(sqlDB)
	if err != nil {
		log.Fatalf("migrate: init: %v", err)
	}

	if err := run(migrator, cmd, flag.Args()[1:]); err != nil {
		log.Fatalf("migrate: %s: %v", cmd, err)
	}
}

func run(m *database.Migrator, cmd string, args []string) error {
	switch cmd {
	case "up":
		return m.Up()
	case "down":
		return m.Down()
	case "down-to":
		if len(args) != 1 {
			return fmt.Errorf("down-to requires exactly one version argument")
		}
		version, err := strconv.ParseInt(args[0], 10, 64)
		if err != nil {
			return fmt.Errorf("invalid version %q: %w", args[0], err)
		}
		return m.DownTo(version)
	case "status":
		return m.Status()
	case "version":
		v, err := m.Version()
		if err != nil {
			return err
		}
		fmt.Println(v)
		return nil
	default:
		return fmt.Errorf("unknown command %q", cmd)
	}
}
