package entity

// Standard actions used across resources. "manage" is a wildcard within one
// resource (equivalent to create+read+update+delete for that resource).
const (
	ActionCreate = "create"
	ActionRead   = "read"
	ActionUpdate = "update"
	ActionDelete = "delete"
	ActionManage = "manage"
)

type Permission struct {
	IDMixin
	Timestamps

	Resource string `gorm:"column:resource;not null"`
	Action   string `gorm:"column:action;not null"`
	// Name is a DB-generated column (resource || ':' || action); read-only
	// from Go, hence "->" instead of a writable tag.
	Name        string  `gorm:"column:name;->"`
	Description *string `gorm:"column:description"`
}

func (Permission) TableName() string { return "permissions" }
