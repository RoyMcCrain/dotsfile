#!/bin/zsh

if ! command -v ghq >/dev/null 2>&1; then
	echo "ghq command not found. Please install ghq."
	exit 1
fi

# Define the base directory
BASE_DIR=$(ghq root)/github.com/RoyMcCrain/dotsfile

# Define the files/folders to link
LINK_ITEMS=(
	"zshrc"
	"nvim"
	"gemrc"
	"gitconfig"
)

# Create symbolic links
for ITEM in "${LINK_ITEMS[@]}"
do
	if [[ ${ITEM} == "nvim" ]]; then
		DESTINATION=~/.config/${ITEM}
	else
		DESTINATION=~/.${ITEM}
	fi

	ln -s ${BASE_DIR}/${ITEM} ${DESTINATION}
done

ASDF_ITEMS=(
	"default-gems"
	"asdfrc"
	)

# Create symbolic links
for ITEM in "${ASDF_ITEMS[@]}"
do
	DESTINATION=~/.${ITEM}

	ln -s ${BASE_DIR}/asdf/${ITEM} ${DESTINATION}
done
